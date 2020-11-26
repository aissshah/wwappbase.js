/** Add "standard crud functions" to ServerIO and ActionMan */

import _ from 'lodash';
import { assert, assMatch } from '../utils/assert';
import C from '../CBase';
import DataStore, { getListPath } from './DataStore';
import {getId, getType, nonce} from '../data/DataClass';
import JSend from '../data/JSend';
import Login from 'you-again';
import {encURI, mapkv, parseHash} from '../utils/miscutils';

import ServerIO from './ServerIOBase';
import ActionMan from './ActionManBase';
import {notifyUser} from './Messaging';
import List from '../data/List';
import * as jsonpatch from 'fast-json-patch';
import deepCopy from '../utils/deepCopy';


/**
 * @param item {DataItem} can be null, in which case the item is got from DataStore
 * @returns {!Promise}
 */
const crud = ({type, id, action, item, previous}) => {
	if ( ! type) type = getType(item);
	if ( ! id) id = getId(item);
	assMatch(id, String);
	assert(C.TYPES.has(type), type);
	assert(C.CRUDACTION.has(action), "unrecognised action "+action+" for type "+type);
	if ( ! item) { 
		let status = startStatusForAction(action);
		item = DataStore.getData({status, type, id});
	}
	if ( ! item) {
		// No item? fine for action=delete. Make a transient dummy here
		assert(action==='delete', "no item?! "+action+" "+type+" "+id);
		item = {id, "@type": type};
	}
	if ( ! getId(item)) {
		// item has no ID?! Better fix that
		console.warn("crud() - item without an ID! - setting id to "+id+". Best practice is to set the id property when creating the object.");
		item.id = id;
	}
	if ( ! getType(item)) {
		console.warn("crud() - item without a type! - setting type to "+type+". Best practice is to use `new MyClass()` to set type when creating the object.");
		item['@type'] = type;
	}
	// new item? then change the action
	if (id===C.newId && action==='save') {
		action = 'new';
	}

	// TODO optimistic local edits
	// crud2_optimisticLocalEdit()

	// mark the widget as saving (defer 'cos this triggers a react redraw, which cant be done inside a render, where we might be)
	_.defer(() => DataStore.setLocalEditsStatus(type, id, C.STATUS.saving));
	
	// const status = serverStatusForAction(action);
	
	// to spot and so preserve edits during the ajax call
	const itemBefore = deepCopy(item);

	// call the server
	return SIO_crud(type, item, previous, action)
		.then( res => crud2_processResponse({res, item, itemBefore, id, action, type}) )
		.catch(err => {
			// bleurgh
			console.warn(err);
			let msg = JSend.message(err) || 'Error';
			// HACK remove the stacktrace which our servers put in for debug
			msg = msg.replace(/<details>[\s\S]*<\/details>/, "").trim();
			notifyUser(new Error(action+" failed: "+msg));
			// If it is a 401 - check the login status
			if (err.status && err.status===401) {
				Login.verify().catch(() => {
					notifyUser(new Error("Your login failed - Perhaps your session has expired. Please try logging in again. If that doesn't help, please contact support."));
				});
			}
			// mark the object as error
			DataStore.setLocalEditsStatus(type, id, C.STATUS.saveerror);
			// and log an error relating to it
			DataStore.setValue(errorPath({type, id, action}), msg);
			return err;
		});
}; // ./crud
ActionMan.crud = crud;

const crud2_processResponse = ({res, item, itemBefore, id, action, type}) => {
	const pubpath = DataStore.getPathForItem(C.KStatus.PUBLISHED, item);
	const draftpath = DataStore.getPathForItem(C.KStatus.DRAFT, item);
	const navtype = (C.navParam4type? C.navParam4type[type] : null) || type;
	
	// Update DS with the returned item, but only if the crud action went OK
	const freshItem = JSend.success(res) && JSend.data(res);
	if (freshItem) {
		// Preserve very recent local edits (which we haven't yet told the server about)
		let recentLocalDiffs = jsonpatch.compare(itemBefore, item);
		if (recentLocalDiffs.length) {
			console.warn("Race condition! Preserving recent local edits", recentLocalDiffs);
			jsonpatch.applyPatch(freshItem, recentLocalDiffs);
		}

		if (action==='publish') {				
			// set local published data				
			DataStore.setValue(pubpath, freshItem);				
			// update the draft version on a publish or a save
			// ...copy it to allow for edits ??by whom?
			let draftItem = _.cloneDeep(freshItem);
			DataStore.setValue(draftpath, draftItem);
		}
		if (action==='save') {
			// TODO we want to update DS, but there's a latency issue and we don't want to lose very-recent edits by the user.
			// HACK: Let's update the status field, as the server owns that (and it avoids the "stuck on published" bug seen in SoGive Oct 2020)
			// (better: use diffs)
			DataStore.setValue(draftpath.concat('status'), freshItem.status);
		}
	}
	// success :)
	if (action==='unpublish') {
		// remove from DataStore
		DataStore.setValue(pubpath, null);
	}
	if (action==='delete') {
		DataStore.setValue(pubpath, null);
		DataStore.setValue(draftpath, null);
		// ??what if we were deleting a different Item than the focal one??
		DataStore.setUrlValue(navtype, null);
	} else if (id===C.newId) {
		// id change!
		// updateFromServer should have stored the new item
		// So just repoint the focus
		const serverId = getId(res.cargo);
		DataStore.setFocus(type, serverId); // deprecated
		DataStore.setUrlValue(navtype, serverId);
	}
	// clear the saving flag
	DataStore.setLocalEditsStatus(type, id, C.STATUS.clean);
	// and any error
	DataStore.setValue(errorPath({type, id, action}), null);
	return res;
};

/**
 * @returns DataStore path for crud errors from this
 */
const errorPath = ({type, id, action}) => {
	return ['transient', type, id, action, 'error'];
};

const saveEdits = ({type, id, item, previous}) => {
	if ( ! type) type = getType(item);
	if ( ! id) id = getId(item);
	assMatch(id, String);
	return crud({type, id, action: 'save', item, previous});
};
ActionMan.saveEdits = saveEdits;

/**
 * This will modify the ID!
 * @param onChange {Function: newItem => ()}
 * @returns {Promise}
 */
ActionMan.saveAs = ({type, id, item, onChange}) => {
	if ( ! item) item = DataStore.getData(C.KStatus.DRAFT, type, id);
	if ( ! item) item = DataStore.getData(C.KStatus.PUBLISHED, type, id);
	assert(item, "Crud.js no item "+type+" "+id);	
	if ( ! id) id = getId(item);
	// deep copy
	let newItem = JSON.parse(JSON.stringify(item));
	newItem.status = C.KStatus.DRAFT; // ensure its a draft 
	// parentage
	newItem.parent = id;
	// modify
	const newId = nonce();	
	newItem.id = newId;
	if (newItem.name) {
		// make a probably unique name - use randomness TODO nicer
		newItem.name += ' v_'+nonce(3);
	}

	// save local
	DataStore.setData(C.KStatus.DRAFT, newItem);
	// modify e.g. url
	if (onChange) onChange(newItem);
	// save server
	let p = crud({type, id:newId, action:'copy', item:newItem});
	return p;
};

ActionMan.unpublish = (type, id) => {	
	assMatch(type, String);
	assMatch(id, String, "Crud.js no id to unpublish "+type);	
	// TODO optimistic list mod
	// preCrudListMod({type, id, action:'unpublish'});
	// call the server
	return crud({type, id, action:'unpublish'})
		.catch(err => {
			// invalidate any cached list of this type
			DataStore.invalidateList(type);
			return err;
		}); // ./then	
};

/**
 * Thiss will save and publish
 * @param {!string} type 
 * @param {!string} id 
 * @param {?Item} item 
 */
const publishEdits = (type, id, item) => {
	assMatch(type, String);
	assMatch(id, String, "Crud.js no id to publish to "+type);
	// if no item - well its the draft we publish
	if ( ! item) item = DataStore.getData({status:C.KStatus.DRAFT, type, id});
	assert(item, "Crud.js no item to publish "+type+" "+id);

	// optimistic list mod
	preCrudListMod({type, id, item, action: 'publish'});
	// call the server
	return crud({type, id, action: 'publish', item})
		.catch(err => {
			// invalidate any cached list of this type
			DataStore.invalidateList(type);
			return err;
		}); // ./then
};
ActionMan.publishEdits = publishEdits;

const preCrudListMod = ({type, id, item, action}) => {
	assert(type && (item || id) && action);
	
	// TODO Update draft list??
	// TODO invalidate any (other) cached list of this type (eg filtered lists may now be out of date)
	// Optimistic: add to the published list (if there is one - but dont make one as that could confuse things)
	if (C.CRUDACTION.ispublish(action)) {
		[C.KStatus.PUBLISHED, C.KStatus.ALL_BAR_TRASH].forEach(status => {
			const path = getListPath({type, status});
			const list = DataStore.getValue(path);
			if (!list) return;
			List.remove(item, list); // No duplicates - remove any existing copy of the item
			List.add(item, list, 0);
			DataStore.setValue(path, list);
		});
		return;
	}

	// delete => optimistic remove
	if (C.CRUDACTION.isdelete(action)) {
		if ( ! item) item = {type, id};
		[C.KStatus.PUBLISHED, C.KStatus.ALL_BAR_TRASH].forEach(status => {
			// NB: see getListPath for format, which is [list, type, status, domain, query, sort]
			let domainQuerySortList = DataStore.getValue('list', type, status);
			recursivePruneFromTreeOfLists(item, domainQuerySortList);
		});
	} // ./action=delete

	if (action === 'archive') {
		const path = getListPath({type, status: 'ARCHIVED'});
		const list = DataStore.getValue(path);
		if (!list) return;
		List.add(item, list, 0);
		DataStore.setValue(path, list);
	}
};

/**
 * @param treeOfLists Must have no cycles!
 */
const recursivePruneFromTreeOfLists = (item, treeOfLists) => {
	if ( ! treeOfLists) return;
	mapkv(treeOfLists, (k, kid) => {
		if (List.isa(kid)) {
			return;
		}
		recursivePruneFromTreeOfLists(item, kid);
	});
};

ActionMan.discardEdits = (type, id) => {
	return crud({type, id, action:C.CRUDACTION.discardEdits});	
};

/**
 * 
 * @param {*} type 
 * @param {*} pubId 
 * @returns {!Promise}
 */
ActionMan.delete = (type, pubId) => {
	// optimistic list mod
	preCrudListMod({type, id:pubId, action:'delete'});
	// ?? put a safety check in here??
	return crud({type, id:pubId, action:'delete'})
		.then(e => {
			console.warn("deleted!", type, pubId, e);
			// remove the local versions
			DataStore.setValue(getDataPath({status: C.KStatus.PUBLISHED, type, id: pubId}), null);
			DataStore.setValue(getDataPath({status: C.KStatus.DRAFT, type, id: pubId}), null);
			// invalidate any cached list of this type
			DataStore.invalidateList(type);
			return e;
		});
};

/**
 * Archive this item
 */
// ?? should we put a confirm in here, and in delete()? But what if we are doing a batch operation?
// -- let's not -- but be sure to put it in calling functions
ActionMan.archive = ({type, item}) => {	
	// optimistic list mod
	preCrudListMod({type, item, action: 'archive'});
	return crud({ type, item, action: C.CRUDACTION.archive });
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
		case C.CRUDACTION.unpublish: // is this OK?? It could be applied to either
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
		case C.CRUDACTION.copy:
		case C.CRUDACTION.save:
		case C.CRUDACTION.discardEdits:
		case C.CRUDACTION.delete: // this one shouldn't matter
			return C.KStatus.DRAFT;
		case C.CRUDACTION.publish:
			return C.KStatus.PUBLISHED;
		case C.CRUDACTION.unpublish:
			return C.KStatus.DRAFT;
		case C.CRUDACTION.archive:
			return C.KStatus.ARCHIVED;
	}
	throw new Error("TODO serverStatusForAction "+action);
};

/**
 * ServerIO (ie this does not use our client side datastore) crud call 
 * @param {!string} type 
 * @param {Item} item 
 * @param {?Item} previous Optional pre-edit version of item. If supplied, a diff will be sent instead of the full item.
 * @param {!string} action 
 */
const SIO_crud = function(type, item, previous, action) {	
	assert(C.TYPES.has(type), type);
	assert(item && getId(item), item);
	assert(C.CRUDACTION.has(action), type);
	const status = serverStatusForAction(action);
	const data = {
		action,
		status,
		type, // hm: is this needed?? the stype endpoint should have it		
	};
	// diff?
	if (previous) {
		let diff = jsonpatch.compare(previous, item);
		// remove add-null, as the server ignores it
		diff = diff.filter(op => ! (op.op==="add" && op.value===null));
		// no edits and action=save? skip save
		if ( ! diff.length && action==='save') {
			console.log("crud", "skip no-diff save", item, previous);
			const jsend = new JSend();
			return Promise.resolve(jsend); // ?? is this the right thing to return
		}
		data.diff = JSON.stringify(diff);
	} else {
		data.item = JSON.stringify(item);
	}
	let params = {
		method: 'POST',
		data
	};
	if (action==='new') {
		params.data.name = item.name; // pass on the name so server can pick a nice id if action=new
	}
	
	// NB: load() includes handle messages
	let id = getId(item);
	let url = ServerIO.getUrlForItem({type, id, status});
	return ServerIO.load(url, params);
	// NB: our data processing is then done in crud2_processResponse()
};
// debug hack
window.SIO_crud = SIO_crud;

ServerIO.saveEdits = function(type, item, previous) {
	return SIO_crud(type, item, previous, 'save');
};
const SIO_publishEdits = function(type, item, previous) {
	return SIO_crud(type, item, previous, 'publish');
};
ServerIO.discardEdits = function(type, item, previous) {
	return SIO_crud(type, item, previous, C.CRUDACTION.discardEdits);
};
ServerIO.archive = function(type, item, previous) {
	return SIO_crud(type, item, previous, 'archive');
};

/**
 * get an item from the backend -- does not save it into DataStore
 * @param {?Boolean} swallow
 */
const SIO_getDataItem = function({type, id, status, domain, swallow, ...other}) {
	assert(C.TYPES.has(type), 'Crud.js - ServerIO - bad type: '+type);
	if ( ! status) {
		console.warn("Crud.js - SIO_getDataItem: no status - this is unwise! Editor pages should specify DRAFT. type: "+type+" id: "+id);
	}
	assMatch(id, String);
	const params = {data: other, swallow};
	let url = ServerIO.getUrlForItem({type, id, domain, status});
	return ServerIO.load(url, params);
};


/**
 * get an item from DataStore, or call the backend if not there (and save it into DataStore)
 * @param type {!String} From C.TYPES
 * @param status {?String} From C.KStatus. If in doubt: use PUBLISHED for display, and DRAFT for editors. 
 * 	Default: look for a status= parameter in thre url, or use published.
 * @param {?string} action e.g. `getornew`
 * @returns PromiseValue
 */
const getDataItem = ({type, id, status, domain, swallow, action, ...other}) => {
	assert(id!=='unset', "ActionMan.getDataItem() "+type+" id:unset?!");
	assert(C.TYPES.has(type), 'Crud.js - ActionMan - bad type: '+type);
	assMatch(id, String);
	if ( ! status) status = DataStore.getUrlValue('status') || C.KStatus.PUBLISHED;
	assert(C.KStatus.has(status), 'Crud.js - ActionMan - bad status '+status+" for get "+type);
	// TODO Decide if getPath should take object argument
	let path = DataStore.getDataPath({status, type, id, domain});
	return DataStore.fetch(path, () => {
		return SIO_getDataItem({type, id, status, domain, swallow, action, ...other});
	}, ! swallow);
};
ActionMan.getDataItem = getDataItem;

/**
 * Smooth update: Get an update from the server without null-ing out the local copy.
 */
ActionMan.refreshDataItem = ({type, id, status, domain, ...other}) => {
	console.log("refreshing...", status, type, id);
	assert(C.KStatus.has(status), "Crud.js bad status "+status);
	assert(C.TYPES.has(type), 'Crud.js - ActionMan refreshDataItem - bad type: '+type);
	assMatch(id, String);
	return SIO_getDataItem({type, id, status, domain, ...other})
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


/**
 * @param sort {?String} e.g. "start-desc"
 * @param {?string|Date} start Add a time-filter. Usually unset.
 * @param {?string|Date} end Add a time-filter. Usually unset.
 * @returns PromiseValue<{hits: Object[]}>
 * 
 * WARNING: This should usually be run through DataStore.getDataList() before using
 */
// Namespace anything fetched from a non-default domain
ActionMan.list = ({type, status, q, prefix, start, end, sort, domain}) => {	
	assert(C.TYPES.has(type), type);
	const lpath =  getListPath({type,status,q,prefix,start,end,sort,domain});
	return DataStore.fetch(lpath, () => {
		return ServerIO.list({type, status, q, prefix, start, end, sort, domain});
	});
};

/*
{
	vert: {
		...adverts
	}
	portal.good-loop.com: {verty}
}
*/

/**
 * 
 * @returns promise(List) 
 * List has form {hits: Object[], total: Number} -- see List.js
 */
ServerIO.list = ({type, status, q, prefix, start, end, sort, domain = ''}) => {
	assert(C.TYPES.has(type), 'Crud.js - ServerIO.list - bad type:' +type);
	let servlet = ServerIO.getEndpointForType(type);
	assert(C.KStatus.has(status), 'Crud.js - ServerIO.list - bad status: '+status);
	// NB '/_list' used to be '/list' until July 2018
	let url = domain + servlet 
		+ (ServerIO.dataspace? '/'+ServerIO.dataspace : '')
		+ '/_list.json';
	let params = {
		data: {status, q, start, end, prefix, sort}
	};	
	return ServerIO.load(url, params)
		.then(res => { // sanity check
			if (JSend.success(res)) {
				List.assIsa(JSend.data(res), "Not a List "+url);
			}
			return res;
		});
};

/**
 * The id from a /servlet/id# RESTful url. 
 * Assumes: the last segment is the id.
 * @returns {?string}
 */
const restId = () => {
	let {path, params} = parseHash();
	if (path.length < 2) return null;
	if (path.length > 2) {
		console.warn("restId() - unusually long rest path: "+path);
	}
	return path[1];
};
/**
 * The id and dataspace from a /servlet/dataspace/id# RESTful url. 
 * @returns {id, dataspace}
 */
const restIdDataspace = () => {
	let {path, params} = parseHash();
	if (path.length < 2) return {};
	const dataspace = path[1];
	const id = path[2];
	return {id, dataspace};
};

const CRUD = {
};
export default CRUD;
export {
	saveEdits,
	publishEdits,
	errorPath,
	getDataItem,
	restId,
	restIdDataspace,
};
