
import {assert, assMatch} from 'sjtest';
import Login from 'you-again';
import PV from 'promise-value';
import _ from 'lodash';

import {C} from "../../../../src-js/C.js";

import ServerIO from './ServerIO';
import DataStore from './DataStore';
import {getId, getType} from '../data/DataClass';
import NGO from '../data/charity/NGO';
import FundRaiser from '../data/charity/FundRaiser';
import Donation from '../data/charity/Donation';
import Project from '../data/charity/Project';
import Money from '../data/charity/Money';
import Ticket from '../data/charity/Ticket';
import Basket from '../data/Basket';
import Output from '../data/charity/Output';
import Citation from '../data/charity/Citation';


const addCharity = () => {
	// TODO search the database for potential matches, and confirm with the user
	// get the info (just the name)
	let item = DataStore.appstate.widget.AddCharityWidget.form;
	assert(item.name);
	// TODO message the user!
	ServerIO.addCharity(item)
	.then(res => {
		console.log("AddCharity", res);
		let charity = res.cargo;
		DataStore.setValue(['widget','AddCharityWidget','result','id'], NGO.id(charity));
	});
};


const addProject = ({charity, isOverall}) => {
	assert(NGO.isa(charity));
	let item = DataStore.appstate.widget.AddProject.form;
	if (isOverall) item.name = Project.overall;
	let proj = Project.make(item);
	// add to the charity	
	if ( ! charity.projects) charity.projects = [];
	charity.projects.push(proj);
	// clear the form
	DataStore.setValue(['widget', 'AddProject', 'form'], {});
};

const removeProject = ({charity, project}) => {
	assert(NGO.isa(charity));
	let i = charity.projects.indexOf(project);
	charity.projects.splice(i,1);
	// update
	DataStore.update();
};

const addInputOrOutput = ({list, ioPath, formPath}) => {
	assert(_.isArray(list), list);
	let item = DataStore.getValue(formPath);
	// Copy the form value to be safe against shared state? Not needed now setValue {} works.
	// item = Object.assign({}, item);
	// add to the list
	list.push(item);
	// clear the form
	DataStore.setValue(formPath, {});
};

const addDataSource = ({list, srcPath, formPath}) => {
	assert(_.isArray(list), list);
	let citation = Citation.make(DataStore.getValue(formPath));
	
	list.push(citation);
	DataStore.setValue(srcPath, list);
	
	// clear the form
	DataStore.setValue(formPath, {});
};

const donate = ({charity, formPath, formData, stripeResponse}) => {
	const donationParams = {
		action: 'donate',
		charityId: NGO.id(charity),
		currency: formData.amount.currency,
		value: formData.amount.value,
		value100: Math.floor(formData.amount.value * 100),
		giftAid: formData.giftAid,
		name: formData.name,
		address: formData.address,
		postcode: formData.postcode,
		stripeToken: stripeResponse.id,
		stripeTokenType: stripeResponse.type,
		stripeEmail: stripeResponse.email,
	};
	Money.assIsa(donationParams);

	// Add impact to submitted data
	const project = NGO.getProject(charity);
	if (project && project.outputs) {		
		let donationImpacts = project.outputs.map(output => Output.scaleByDonation(output, donationParams));
		donationParams.impacts = JSON.stringify(donationImpacts);
	}

	ServerIO.donate(donationParams)
	.then(function(response) {
		DataStore.setValue(formPath, {
			...formData,
			pending: false,
			complete: true,
		});
	}, function(error) {});

	DataStore.setValue(formPath, {
		...formData,
		pending: true,
	});
};


/**
 * id=for{user.id}, becuase a user only has one basket
 */
const getBasketPV = (uxid) => {
	if ( ! uxid) {
		uxid = Login.getId() || Login.getTempId();		
	}
	const bid = Basket.idForUxid(uxid);
	// Basket is normally DRAFT (PUBLISHED = paid for)
	let pvbasket = ActionMan.getDataItem({type:C.TYPES.Basket, id:bid, status: C.KStatus.DRAFT, swallow:true});
	if (pvbasket.value) return pvbasket;
	// loading - or maybe we have to make a new basket
	let pGetMake = pvbasket.promise.fail(err => {
		console.log("make a new basket");
		let basket = Basket.make({id: bid});
		DataStore.setData(basket);
		return basket;
	});
	return PV(pGetMake);
};

/**
 * 
 * @param {!Basket} basket 
 * @param {!Ticket} item 
 */
const addToBasket = (basket, item) => {
	console.log("addFromBasket",basket, item);
	assert(item, basket);
	Basket.assIsa(basket);
	assert(item.id, item); // need an ID
	// copy so we can safely modify elsewhere
	// copy a ticket
	if (Ticket.isa(item)) {
		item = Ticket.make(item, item.eventId);
	} else {
		console.log("addToBasket - not a Ticket", item);
		item = _.cloneDeep(item);
	}
	basket.items = (basket.items || []).concat(item);
	DataStore.setData(basket);
	return basket;
};

const removeFromBasket = (basket, item) => {
	console.log("removeFromBasket",basket, item);
	assert(item);
	Basket.assIsa(basket);
	// remove the first matching item (Note: items can share an ID)	
	const i = basket.items.findIndex(itm => getId(itm) === getId(item));
	if (i === -1) {
		return;
	}
	basket.items.splice(i, 1);
	DataStore.setData(basket);
	return basket;
};

const getBasketPath = (uxid) => {
	if ( ! uxid) {
		uxid = Login.getId() || Login.getTempId();		
	}
	const bid = Basket.idForUxid(uxid);
	return ['data', C.TYPES.Basket, bid];
};

/**
 * NB: uses a pseudo id of `draft-to:X`
 * 
 * {
 * 	item: {?NGO|FundRaiser},
 * 	charity: {?String} id
 * 	fundRaiser: {?String} id
 * }
 */
const getDonationDraft = ({item, charity, fundRaiser}) => {
	assMatch(charity, "?String");
	assMatch(fundRaiser, "?String");
	// ID info from item
	if (item) {
		if (NGO.isa(item)) charity = getId(item);
		if (FundRaiser.isa(item)) {
			fundRaiser = getId(item);			
			// can we get a charity?
			let fCharity = FundRaiser.charityId(item);
			if ( ! charity) charity = fCharity;
			assert(charity === fCharity);
		}
	}
	// for fundraiser if known, or charity
	const forId = fundRaiser || charity;
	assMatch(forId, String, "getDonationDraft() expects an id string");
	// use a pseudo id to keep it in the local DataStore
	let from = Login.getId();
	return DataStore.fetch(['data', C.TYPES.Donation, 'from:'+from, 'draft-to:'+forId], () => {
		return ServerIO.getDonationDraft({from, charity, fundRaiser})
			.then(res => {
				console.warn("getDonationDraft", res, 'NB: take cargo.hits.0');
				let cargo = res.cargo;			
				let dontn = cargo.hits && cargo.hits[0];
				if ( ! dontn) {
					// make a new draft donation
					dontn = Donation.make({
						to: charity,
						fundRaiser: fundRaiser,
						via: FundRaiser.isa(item)? FundRaiser.oxid(item) : null,
						from: from,
						amount: Money.make({ value: 10, currency: 'gbp' }),
						coverCosts: true,
					});
					console.warn('donationDraft-new', dontn);
				}
				// store in data by ID (the fetch stores under draft-to)
				DataStore.setData(dontn);
				return dontn;
			}); // ./then()
	}); // ./fetch()
};


const ActionMan = {
	addCharity,
	addProject, removeProject,
	addInputOrOutput,
	addDataSource,
	donate,
	getDonationDraft,
	getBasketPV,
	addToBasket, 
	removeFromBasket,
	getBasketPath,
};

export default ActionMan;

