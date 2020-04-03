import React from 'react';
import { assert, assMatch } from 'sjtest';
import Login from 'you-again';
import {Modal} from 'react-bootstrap';
import { XId, uid } from 'wwutils';
import Cookies from 'js-cookie';
import PromiseValue from 'promise-value';
import DataStore from '../plumbing/DataStore';
import Misc from './Misc';
import C from '../CBase';
import DataClass, {getType, getId, getClass} from '../data/DataClass';
import Roles, {getRoles} from '../Roles';
import Shares, {Share, canRead, canWrite, shareThingId} from '../Shares';

/**
 * a Share This button
 */
const ShareLink = ({item, type, id, thingId}) => {
	assert( ! thingId, "old code - switch to item, or type+id");
	if (item) {
		type = getType(item);
		id = getId(item);
	}
	if ( ! type || ! id) {
		return null;
	}
	thingId = shareThingId(type, id);
	const basePath = ['widget', 'ShareWidget', thingId];
	return (<a href={window.location} onClick={ e => { e.preventDefault(); e.stopPropagation(); DataStore.setValue(basePath.concat('show'), true); } } >
		<Misc.Icon prefix="fas" fa="share-square" /> Share
	</a>);
};

/**
 *
 * @param {!String} shareId - From shareThingId()
 */
const shareThing = ({shareId, withXId}) => {
	assMatch(shareId, String);
	Shares.doShareThing({shareId, withXId});
	// clear the form
	DataStore.setValue(['widget', 'ShareWidget', 'add'], {});
};

/**
 * confirm and delete
 */
const deleteShare = ({share}) => {
	let ok = confirm('Remove access: Are you sure?');
	if ( ! ok) return;
	// call the server
	const thingId = share.item;
	assMatch(thingId, String);
	Shares.doDeleteShare(share);
};

//Collate data from form and shares paths, then send this data off to the server
const sendEmailNotification = (url, emailData) => {
	assMatch(url, String);

	const params = {
		data: emailData
	};
	ServerIO.load(url, params);
};

/**
 * A dialog for adding and managing shares
 *
 * @param {DataClass} item - The item to be shared
 * @param {?String}	name - optional name for the thing
 *
 * Note: This does NOT include the share button -- see ShareLink for that
*/
const ShareWidget = ({item, type, id, name}) => {
	if (item) {
		type = getType(item);
		id = getId(item);
		name = getClass(type) && getClass(type).getName(item);
	}
	if ( ! type || ! id) {
		return null;
	}
	const shareId = shareThingId(type, id);
	const basePath = ['widget', 'ShareWidget', shareId];
	let data = DataStore.getValue(basePath) || DataStore.setValue(basePath, {form: {}}, false);
	const {warning, show, form} = data;
	const formPath = basePath.concat('form');
	if ( ! name) name = shareId;
	let title = "Share "+name;
	let { email: withXId, enableNotification } = form;
	if (withXId) withXId += '@email';
	let sharesPV = Shares.getShareListPV(shareId);
	let validEmailBool = C.emailRegex.test(DataStore.getValue(formPath.concat('email')));
	// TODO share by url on/off
	// TODO share message email for new sharers

	return (
		<Modal show={show} className="share-modal" onHide={() => DataStore.setValue(basePath.concat('show'), false)}>
			<Modal.Header closeButton>
				<Modal.Title>
					<Misc.Icon prefix="fas" fa="share-square" size="large" />
					{title}
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<div className="container-fluid">
					<div className="row form-inline">
						<Misc.PropControl inline label='Email to share with' path={formPath} prop='email' type='email' />
					</div>
					<div className="row">
						<Misc.PropControl path={formPath} prop='enableNotification' label='Send a notification email' type='checkbox'/>
						{enableNotification? <Misc.PropControl path={formPath} prop='optionalMessage' id='OptionalMessage' label='Attached message' type='textarea' /> : null}
						<button className='btn btn-primary btn-lg btn-block' disabled={!validEmailBool}
							onClick={()=>{
								const {form} = DataStore.getValue(basePath) || {};

								shareThing({shareId, withXId});
								sendEmailNotification('/testEmail', {...form, senderId: Login.getId()});
								}}>
							Submit
						</button>
					</div>
					<div className="row">
						<h4>Shared with</h4>
						<ListShares list={sharesPV.value} />
					</div>
				</div>
			</Modal.Body>
			<Modal.Footer>
			</Modal.Footer>
		</Modal>
	);
}; // ./ShareWidget

const ListShares = ({list}) => {
	if ( ! list) return <Misc.Loading text='Loading current shares' />;
	// console.warn('ListShares', list);
	if ( ! list.length) return <div className='ListShares'>Not shared.</div>;
	return (<div className='ListShares'>
		{list.map(s => <SharedWithRow key={JSON.stringify(s)} share={s} />)}
	</div>);
};

const SharedWithRow = ({share}) => {
	assert(share, "SharedWithRow");
	return (
		<div className='clearfix'>
			<p className='pull-left'>{share._to}</p>
			<button className='btn btn-outline-danger pull-right'
				title="remove this person's access"
				onClick={ () => deleteShare({share}) }
			>
				<Misc.Icon prefix="fas" fa="cross-circle"/>
			</button>
	</div>);
};

const AccessDenied = ({thingId}) => {
	if ( ! getRoles().resolved) return <Misc.Loading text='Checking roles and access...' />;
	return (<Misc.Card title='Access Denied :('>
		<div>Sorry - you don't have access to this content.
			{thingId? <div><code>Content id: {thingId}</code></div> : null}
			{Login.isLoggedIn()? <div><code>Your id: {Login.getId()}</code></div> : null}
			{getRoles().value && getRoles().value.join? <div><code>Your roles: {getRoles().value.join(", ")}</code></div> : null}
		</div>
	</Misc.Card>);
};

/**
 *
 * @param {String} id - The app item ID.
 */
const ClaimButton = ({type, id}) => {
	const sid = shareThingId(type, id);
	const plist = Shares.getShareListPV(sid);
	if ( ! plist.resolved) {
		return <Misc.Loading text='Loading access details' />;
	}
	if (plist.value.length !== 0) {
		return <div>Access is held by: {plist.value.map( v => v._to + '\n')}</div>;
	}

	return (
		<div>
			This {type} has not been claimed yet. If you are the owner or manager, please claim it.
			<div>
				<button className='btn btn-default' onClick={() => Shares.claimItem({type, id})} >
					Claim {id}
				</button>
			</div>
		</div>);
};

export default ShareWidget;
export {ShareLink, ShareWidget, AccessDenied, ClaimButton, canRead, canWrite, shareThingId};


