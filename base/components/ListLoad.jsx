import React from 'react';
import ReactDOM from 'react-dom';

import SJTest, { assert, assMatch } from 'sjtest';
import Login from 'you-again';
import printer from '../utils/printer.js';
import {modifyHash, join} from 'wwutils';
import C from '../CBase';
import Roles from '../Roles';
import Misc from './Misc';
import PropControl from './PropControl';
import DataStore, { getPath } from '../plumbing/DataStore';
import ServerIO from '../plumbing/ServerIOBase';
import ActionMan from '../plumbing/ActionManBase';
import {getType, getId, nonce} from '../data/DataClass';
import List from '../data/List';

/**
 * Provide a list of items of a given type.
 * Clicking on an item sets it as the nav value.
 * Get the item id via:
 * 
 * 	const path = DataStore.getValue(['location','path']);
 * 	const itemId = path[1];
 * 
 * 
 * @param status {?String} e.g. "Draft"
 * @param servlet {?String} e.g. "publisher" Normally unset, and taken from the url.
 * @param ListItem {?React component} if set, replaces DefaultListItem.
 * 	ListItem only has to describe/present the item
 * 	NB: On-click handling, checkboxes and delete are provided by ListItemWrapper.
 */
const ListLoad = ({type, status, servlet, navpage, 
	q, // Optional query e.g. advertiser-id
	hasFilter, // if true, offer a text filter This will be added to q
	ListItem, 
	checkboxes, canDelete, canCreate, className}) => 
{
	assert(C.TYPES.has(type), "ListLoad - odd type " + type);
	if ( ! status) {
		console.error("ListLoad no status :( defaulting to ALL_BAR_TRASH", type);
		status = C.KStatus.ALL_BAR_TRASH;
	}
	assert(C.KStatus.has(status), "ListLoad - odd status " + status);
	// widget settings
	const widgetPath = ['widget','ListLoad',type,status];
	
	// selected item id from url
	// let path = DataStore.getValue(['location', 'path']);
	// let id = path[1];
	// if (id) return null;

	if ( ! servlet) servlet = DataStore.getValue('location', 'path')[0]; //type.toLowerCase();
	if ( ! navpage) navpage = servlet;
	if ( ! servlet) {
		console.warn("ListLoad - no servlet? type="+type);
		return null;
	}
	assMatch(servlet, String);
	assMatch(navpage, String);
	// store the lists in a separate bit of appstate
	// from data. 
	// Downside: new events dont get auto-added to lists
	// Upside: clearer
	// NB: case-insentive filtering
	const _filter = hasFilter? DataStore.getValue(widgetPath.concat('filter')) : null;
	const filter = _filter? _filter.toLowerCase() : null;
	let q2 = q; //join(q, filter); ??pass filter to back-end??
	let pvItems = ActionMan.list({type, status, q:q2});
	if ( ! pvItems.resolved) {
		return (
			<Misc.Loading text={type.toLowerCase() + 's'} />
		);
	}	
	if ( ! ListItem) {
		ListItem = DefaultListItem;
	}	
	// filter out duplicate-id (paranoia: this should already have been done server side)
	// NB: this prefers the 1st occurrence and preserves the list order.
	let items = [];
	let itemForId = {};
	let hits = pvItems.value && pvItems.value.hits;
	if (hits) {
		hits.forEach(item => {
			// HACK fast filter via stringify
			let sitem = JSON.stringify(item).toLowerCase();
			if (filter && sitem.indexOf(filter) === -1) {
				return; // filtered out
			}
			// dupe?
			let id = getId(item) || sitem;
			if (itemForId[id]) {
				return; // skip dupe
			}
			// ok
			items.push(item);
			itemForId[id] = item;
		});
	} else {
		console.warn("ListLoad.jsx - item list load failed for "+type+" "+status, pvItems);
	}

	return (<div className={join('ListLoad', className, ListItem === DefaultListItem? 'DefaultListLoad' : null)} >
		{items.length === 0 ? 'No results found' : null}
		{canCreate? <CreateButton type={type} /> : null}
		{hasFilter? <div className='filter form-inline'>&nbsp;<label>Filter</label>&nbsp;<PropControl size='sm' type='search' path={widgetPath} prop='filter'/></div> : null}
		{items.map( (item, i) => (
			<ListItemWrapper key={getId(item) || i} 
				item={item} 
				type={type} 
				checkboxes={checkboxes} 
				canDelete={canDelete} 
				servlet={servlet}
				navpage={navpage}
			>
				<ListItem 
					type={type} 
					servlet={servlet} 
					navpage={navpage} 
					item={item} 
				/>
			</ListItemWrapper>
		))}
	</div>);
}; // ./ListLoad
//

const onPick = ({event, navpage, id, customParams}) => {
	if (event) {
		event.stopPropagation();
		event.preventDefault();
	}
	customParams ? modifyHash([navpage,null],customParams) : modifyHash([navpage,id]);
};

/**
 * checkbox, delete, on-click a wrapper
 */
const ListItemWrapper = ({item, type, checkboxes, canDelete, servlet, navpage, children}) => {
	const id = getId(item);
	// for the campaign page we want to manipulate the url to modify the vert/vertiser params 
	// that means both modifying href and onClick definitions
	let itemUrl = servlet==="campaign" ? modifyHash([servlet,null], {'gl.vertiser':null, 'gl.vert':id}, true) : modifyHash([servlet, id], null, true);
	let customParams = servlet==="campaign" ? {'gl.vertiser':null, 'gl.vert':id} : null;

	let checkedPath = ['widget', 'ListLoad', type, 'checked'];

	const checkbox = checkboxes ? (
		<div className='pull-left'>
			<Misc.PropControl title='TODO mass actions' path={checkedPath} type='checkbox' prop={id} />
		</div>
	) : null;

	return (
		<div className='ListItemWrapper clearfix'>
			{checkbox}
			{canDelete? <DefaultDelete type={type} id={id} /> : null }
			<a href={itemUrl}
				onClick={event => onPick({ event, navpage, id, customParams })}
				className={'ListItem btn btn-default status-' + item.status}
			>
				{children}
			</a>
		</div>
	);
};

/**
 * These can be clicked or control-clicked
 * 
 * @param servlet
 * @param navpage -- How/why/when does this differ from servlet??
 * @param nameFn {Function} Is there a non-standard way to extract the item's display name?
 * 	TODO If it's of a data type which has getName(), default to that
 * @param extraDetail {Element} e.g. used on AdvertPage to add a marker to active ads
 */
const DefaultListItem = ({type, servlet, navpage, item, checkboxes, canDelete, nameFn, extraDetail}) => {
	if ( ! navpage) navpage = servlet;
	const id = getId(item);
	// let checkedPath = ['widget', 'ListLoad', type, 'checked'];
	const name = nameFn ? nameFn(item, id) : item.name || item.text || id;
	const status = C.KStatus.isPUBLISHED(item.status)? null : item.status;
	return (
		<div>
			<Misc.Thumbnail item={item} />
			<div className="info">
				<div className="name">{name}</div>
				<div className="detail small">
					id: <span className="id">{id}</span> <span className="status">{status}</span> {extraDetail}
				</div>
			</div>
		</div>
	);
};


const DefaultDelete = ({type,id}) => (
	<button className='btn btn-xs btn-default pull-right' 
		onClick={e => confirm("Delete this "+type+"?")? ActionMan.delete(type, id) : null} 
		title='Delete'>
		<Misc.Icon glyph='trash' />
	</button>
);


/**
 * Make a local blank, and set the nav url
 * Does not save (Crud will probably do that once you make an edit)
 * @param {
 * 	base: {?Object} use to make the blank.
 * 	make: {?Function} use to make the blank. base -> base
 * }
 */
const createBlank = ({type, navpage, base, id, make}) => {
	assert( ! getId(base), "ListLoad - createBlank - ID not allowed (could be an object reuse bug) "+type+". Safety hack: Pass in an id param instead");
	// Call the make?
	if (make) {
		base = make(base);
	}
	if ( ! base) base = {};
	// specify the id?
	if (id) base.id = id;
	// make an id? (make() might have done it)
	if ( ! getId(base)) {
		base.id = nonce(8);
	}
	id = getId(base);
	if ( ! getType(base)) base['@type'] = type;
	// poke a new blank into DataStore
	const path = getPath(C.KStatus.DRAFT, type, id);
	DataStore.setValue(path, base);
	// set the id
	onPick({navpage, id});
	// invalidate lists
	DataStore.invalidateList(type);
};

/**
 * A create-new button
 * @param {{
 * 	type: !String
 * 	navpage: ?String - defaults to the curent page from url
 * }}
 * @param props {?String[]} extra props
 */
const CreateButton = ({type, props, navpage, base, make}) => {
	assert(type);
	assert( ! base || ! base.id, "ListLoad - dont pass in ids (defence against object reuse bugs) "+type);
	if ( ! navpage) navpage = DataStore.getValue('location', 'path')[0];	
	// merge any form props into the base
	const cpath = ['widget','CreateButton'];	
	base = Object.assign({}, base, DataStore.getValue(cpath));
	// was an ID passed in by editor props?
	let id = base.id;
	delete base.id;
	return (<div className={props? 'well' : ''}>
		{props? props.map(prop => <Misc.PropControl key={prop} label={prop} prop={prop} path={cpath} inline />) : null}
		<button className='btn btn-default' onClick={() => createBlank({type,navpage,base,id,make})}>
			<Misc.Icon glyph='plus' /> Create
		</button>		
	</div>);
};

const ListItems = ({type, navpage, servlet}) => {
	assMatch(type, String);
	return (
		<div>
			<h3 className="text-capitalize">List {type}</h3>
			<CreateButton type={type} navpage={navpage} />
			<ListLoad type={type} hasFilter servlet={servlet} status={C.KStatus.ALL_BAR_TRASH} />
		</div>
	);
};

const ListFilteredItems = ({type, navpage, servlet, q}) => {
	assMatch(type, String);
	return (
		<div>
			<h3 className="text-capitalize">List {type}</h3>
			<CreateButton type={type} navpage={navpage} />
			<ListLoad type={type} hasFilter servlet={servlet} status={C.KStatus.ALL_BAR_TRASH} q={q}/>
		</div>
	);
};

export { CreateButton, DefaultListItem, ListItems, ListFilteredItems };
export default ListLoad;
