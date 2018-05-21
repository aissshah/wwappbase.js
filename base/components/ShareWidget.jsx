import React from 'react';
import { assert, assMatch } from 'sjtest';
import Login from 'you-again';
import {Modal} from 'react-bootstrap';
import { XId, uid } from 'wwutils';
import Cookies from 'js-cookie';
import PV from 'promise-value';
import DataStore from '../plumbing/DataStore';
import Misc from './Misc';
import C from '../CBase';


/**
 * a Share This button
 */
const ShareLink = ({thingId}) => {
	const basePath = ['widget', 'ShareWidget', thingId];
	return (<a href={window.location} onClick={ e => { e.preventDefault(); e.stopPropagation(); DataStore.setValue(basePath.concat('show'), true); } } >
		<Misc.Icon glyph='share' /> Share
	</a>);
};

const shareThing = ({thingId, withXId}) => {
	// call the server
	Login.shareThing(thingId, withXId);
	// optimistically update the local list
	const spath = ['misc','shares', thingId];
	let shares = DataStore.getValue(spath) || [];
	shares = shares.concat({
		item: thingId,
		by: Login.getId(),
		_to: withXId 
	});
	DataStore.setValue(spath, shares);
	// clear the form
	DataStore.setValue(['widget', 'ShareWidget', 'add'], {});
};

const deleteShare = ({share}) => {
	// call the server
	const thingId = share.item;
	assMatch(thingId, String);
	Login.deleteShare(thingId, share._to);
	// optimistically update the local list
	const spath = ['misc','shares', thingId];
	let shares = DataStore.getValue(spath) || [];
	shares = shares.filter(s => s !== share);
	DataStore.setValue(spath, shares);
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
 * {
 * 	thingId: {!String} id for the share
 * 	name: {?String} optional name for the thing
 * }
 * 
 * Note: This does NOT include the share button -- see ShareLink for that
*/
const ShareWidget = ({thingId, name}) => {
	const basePath = ['widget', 'ShareWidget', thingId];
	let data = DataStore.getValue(basePath);
	if (!data) {
		data = {form: {}};
		DataStore.setValue(basePath, data);
	}
	const {warning, show, form} = data;
	if ( ! thingId) {
		console.warn("ShareWidget - no thingId");
		return null;
	}
	const formPath = basePath.concat('form');
	if ( ! name) name = thingId;
	let title = "Share "+name;
	let { email: withXId, enableNotification } = form;
	if (withXId) withXId += '@email';
	let sharesPV = DataStore.fetch(['misc','shares', thingId], () => {
		let req = Login.getShareList(thingId);
		return req;
	});
	let validEmailBool = C.emailRegex.test(DataStore.getValue(formPath.concat('email')));
	// TODO share by url on/off
	// TODO share message email for new sharers

	return (
		<Modal show={show} className="share-modal" onHide={() => DataStore.setValue(basePath.concat('show'), false)}>
			<Modal.Header closeButton>
				<Modal.Title>
					<Misc.Icon glyph='share' size='large' />
					{title}
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<div className="container-fluid">
					<div className="row form-inline">
						<Misc.PropControl label='Email to share with' 
							className='ng-invalid' path={formPath} prop={'email'} type='email' />
					</div>	
					<div className="row">
						<Misc.PropControl path={formPath} prop='enableNotification' label='Send notification email' type='checkbox'/>
						<Misc.PropControl path={formPath} prop='optionalMessage' id='OptionalMessage' label='Attached message' type='textarea' disabled={!enableNotification}/>
						<button className='btn btn-primary btn-lg btn-block' disabled={!validEmailBool} 
							onClick={()=>{
								const {form} = DataStore.getValue(basePath) || {};

								shareThing({thingId, withXId});
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
	console.warn('ListShares', list);
	if ( ! list.length) return <div className='ListShares'>Not shared.</div>;
	return (<div className='ListShares'>
		{list.map(s => <SharedWith key={JSON.stringify(s)} share={s} />)}
	</div>);
};

const SharedWith = ({share}) => {
	return (
		<div>
		<button title="remove this person's access"
				onClick={ () => deleteShare({share}) }
		>
			<Misc.Icon glyph='remove'/>
		</button>
			<p>{share._to}</p>
	</div>);
};

const canRead = (thingId) => {
	const p = Login.checkShare(thingId)
		.then(res => {
			return res.cargo && res.cargo.read;
		});
	return PV(p);
};

/**
 * 
 * @param {String} thingId 
 * @returns {PromiseValue<Boolean>} .value resolves to true if they can read
 */
const canWrite = (thingId) => {
	const p = Login.checkShare(thingId)
		.then(res => {
			return res.cargo && res.cargo.write;
		});
	return PV(p);
};

export default ShareWidget;
export {ShareLink, canRead, canWrite};

