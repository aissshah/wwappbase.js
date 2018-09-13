/** Add "standard crud functions" to ServerIO and ActionMan */

import _ from 'lodash';
import $ from 'jquery';
import {SJTest, assert, assMatch} from 'sjtest';
import C from '../CBase';
import DataStore, {getPath} from './DataStore';
import {getId, getType} from '../data/DataClass';
import JSend from '../data/JSend';
import Login from 'you-again';
import {XId, encURI} from 'wwutils';

import ServerIO from './ServerIOBase';
import ActionMan from './ActionManBase';
import {notifyUser} from './Messaging';
import List from '../data/List';

/**
 * @returns Promise
 */
ActionMan.crud = (type, id, action, item) => {
	if ( ! type) type = getType(item);
	if ( ! id) id = getId(item);
	assMatch(id, String);
	assert(C.TYPES.has(type), type);
	assert(C.CRUDACTION.has(action), type);
	if ( ! item) { 
		let status = startStatusForAction(action);
		item = DataStore.getData(status, type, id);
	}
	if ( ! item) {
		// No item? fine for action=delete. Make a transient dummy here
		assert(action==='delete', action+" "+type+" "+id);
		item = {id, "@type": type};
	}
	if ( ! getId(item)) {
		assert(id==='new', id);
		item.id = id;
	}
	// new item? then change the action
	if (id===C.newId && action==='save') {
		action = 'new';
	}
	// mark the widget as saving
	DataStore.setLocalEditsStatus(type, id, C.STATUS.saving);
	const status = serverStatusForAction(action);
	// call the server
	return ServerIO.crud(type, item, action)
		.then(res => DataStore.updateFromServer(res, status))
		.then(res => {
			// success :)
			const navtype = (C.navParam4type? C.navParam4type[type] : null) || type;
			if (action==='delete') {
				DataStore.setUrlValue(navtype, null);
			} else if (id===C.newId) {
				// id change!
				// updateFromServer should have stored the new item
				// So just repoint the focus
				let serverId = getId(res.cargo);
				DataStore.setFocus(type, serverId); // deprecated			
				DataStore.setUrlValue(navtype, serverId);
			}
			// clear the saving flag
			DataStore.setLocalEditsStatus(type, id, C.STATUS.clean);
			return res;
		})
		.catch(err => {
			// bleurgh
			console.warn(err);
			let msg = JSend.message(err) || '';
			notifyUser(new Error(action+" failed: "+msg));
			// mark the object as dirty
			DataStore.setLocalEditsStatus(type, id, C.STATUS.dirty);
			return err;
		});
}; // ./crud

ActionMan.saveEdits = (type, pubId, item) => {
	return ActionMan.crud(type, pubId, 'save', item);
};

ActionMan.publishEdits = (type, pubId, item) => {	
	assMatch(type, String);
	assMatch(pubId, String, "Crud.js no id to publish to "+type);	
	// if no item - well its the draft we publish
	if ( ! item) item = DataStore.getData(C.KStatus.DRAFT, type, pubId);
	assert(item, "Crud.js no item to publish "+type+" "+pubId);
	return ActionMan.crud(type, pubId, 'publish', item)
		.then(res => {			
			const lpath = listPath({type, status:C.KStatus.PUBLISHED});
			let publist = DataStore.getValue(lpath);
			// invalidate any (other) cached list of this type (eg filtered lists may now be out of date)
			DataStore.invalidateList(type);
			// Optimistic: add to the published list (if there is one - but dont make one as that could confuse things)
			if (publist) {
				console.warn("add to pubs", res, publist);
				DataStore.setValue(lpath, publist.concat(res));
			}
			return res;
		}).catch(err => {
			// invalidate any cached list of this type
			DataStore.invalidateList(type);
			return err;
		}); // ./then	
};

ActionMan.discardEdits = (type, pubId) => {
	return ActionMan.crud(type, pubId, C.CRUDACTION.discardEdits);	
};

ActionMan.delete = (type, pubId) => {
	// ?? put a safety check in here??
	return ActionMan.crud(type, pubId, 'delete')
		.then(e => {
			console.warn("deleted!", type, pubId, e);
			// remove the local versions			
			DataStore.setValue(getPath(C.KStatus.PUBLISHED, type, pubId), null);
			DataStore.setValue(getPath(C.KStatus.DRAFT, type, pubId), null);
			// invalidate any cached list of this type
			DataStore.invalidateList(type);
			return e;
		});
};

// ServerIO //

/**
 * What status is the data in at the start of this action.
 * e.g. publish starts with a draft
 */
const startStatusForAction = (action) => {
	switch(action) {
		case C.CRUDACTION.publish:
		case C.CRUDACTION.save: 		
		case C.CRUDACTION.discardEdits: 
		case C.CRUDACTION.delete: // this one shouldn't matter
			return C.KStatus.DRAFT;
	}
	throw new Error("TODO startStatusForAction "+action);
};
/**
 * What status do we send to the server? e.g. publish is published, save is draft.
 */
const serverStatusForAction = (action) => {
	switch(action) {
		case C.CRUDACTION.save: 
		case C.CRUDACTION.discardEdits: 
		case C.CRUDACTION.delete: // this one shouldn't matter
			return C.KStatus.DRAFT;
		case C.CRUDACTION.publish: 
			return C.KStatus.PUBLISHED;
	}
	throw new Error("TODO serverStatusForAction "+action);
};

ServerIO.crud = function(type, item, action) {	
	assert(C.TYPES.has(type), type);
	assert(item && getId(item), item);
	assert(C.CRUDACTION.has(action), type);
	const status = serverStatusForAction(action);
	let params = {
		method: 'POST',
		data: {
			action,
			status,
			type,
			item: JSON.stringify(item)
		}
	};		
	if (action==='new') {
		params.data.name = item.name; // pass on the name so server can pick a nice id if action=new
	}
	let stype = ServerIO.getEndpointForType(type);
	// NB: load() includes handle messages
	return ServerIO.load(stype+'/'+encURI(getId(item))+'.json', params);
};
ServerIO.saveEdits = function(type, item) {
	return ServerIO.crud(type, item, 'save');
};
ServerIO.publishEdits = function(type, item) {
	return ServerIO.crud(type, item, 'publish');
};
ServerIO.discardEdits = function(type, item) {
	return ServerIO.crud(type, item, C.CRUDACTION.discardEdits);
};

/**
 * get an item from the backend -- does not save it into DataStore
 */
ServerIO.getDataItem = function({type, id, status, swallow, ...other}) {
	assert(C.TYPES.has(type), 'Crud.js - ServerIO - bad type: '+type);
	if ( ! status) {
		console.warn("Crud.js - ServerIO.getDataItem: no status - this is unwise! Editor pages should specify DRAFT. type: "+type+" id: "+id);
	}
	assMatch(id, String);
	const params = {data: {status, ...other}, swallow};
	let url = ServerIO.getUrlForItem({type, id, status});
	return ServerIO.load(url, params);
};


/**
 * get an item from DataStore, or call the backend if not there (and save it into DataStore)
 * @returns PromiseValue
 */
ActionMan.getDataItem = ({type, id, status, swallow, ...other}) => {
	assert(id!=='unset', "ActionMan.getDataItem() "+type+" id:unset?!");
	assert(C.TYPES.has(type), 'Crud.js - ActionMan - bad type: '+type);
	assMatch(id, String);
	assert(C.KStatus.has(status), 'Crud.js - ActionMan - bad status '+status+" for get "+type);
	return DataStore.fetch(DataStore.getPath(status, type, id), () => {
		return ServerIO.getDataItem({type, id, status, swallow, ...other});
	}, ! swallow);
};

/**
 * Smooth update: Get an update from the server without null-ing out the local copy.
 */
ActionMan.refreshDataItem = ({type, id, status, ...other}) => {
	console.log("refreshing...", status, type, id);
	assert(C.KStatus.has(status), "Crud.js bad status "+status);
	assert(C.TYPES.has(type), 'Crud.js - ActionMan refreshDataItem - bad type: '+type);
	assMatch(id, String);
	return ServerIO.getDataItem({type, id, status, ...other})
		.then(res => {
			if (res.success) {
				console.log("refreshed", type, id);
				let item = res.cargo;
				DataStore.setData(status, item);				
			} else {
				console.warn("refresh-failed", res, type, id);
			}
		});
};


const listPath = ({type,status,q}) => ['list', type, status, q || 'all'];

/**
 * 
 * @returns PV( {hits: Object[]} )
 */
ActionMan.list = ({type, status, q}) => {
	assert(C.TYPES.has(type), type);
	const lpath = listPath({type,status,q});
	return DataStore.fetch(lpath, () => {
		return ServerIO.list({type, status, q});
	});
};

/**
 * 
 * @returns promise(List) 
 * List has form {hits: Object[], total: Number} -- see List.js
 */
ServerIO.list = ({type, status, q}) => {
	assert(C.TYPES.has(type), type);
	let servlet = ServerIO.getEndpointForType(type);
	assert(C.KStatus.has(status), status);
	// NB '/_list' used to be '/list' until July 2018
	let url = servlet 
		+ (ServerIO.dataspace? '/'+ServerIO.dataspace : '')
		+ '/_list.json';
	let params = {
		data: {status, q}
	};	
	return ServerIO.load(url, params)
		.then(res => { 	// sanity check
			if (JSend.success(res)) {
				List.assIsa(JSend.data(res), "Not a List "+url);
			}
			return res;
		});
};


const CRUD = {	
};
export default CRUD;