
// TODO move social share buttons from DonationForm here

import React from 'react';
import {assert, assMatch} from 'sjtest';
import {encURI} from 'wwutils';

import DataStore from '../plumbing/DataStore';
import C from '../C';

import Money from '../data/charity/Money';
import NGO from '../data/charity/NGO';
import Project from '../data/charity/Project';

import Misc from './Misc.jsx';


const shareOnFacebook = ({url, shareText, take2}) => {
	if (window.FB) {
		FB.ui({
			quote: shareText,
			method: 'share',
			href: url,
		},
		// callback
		function(response) {
			console.log("FB", response);
			if (response && response.error_message) {
				console.error('Error while posting.');
				return;
			}
			// foo
		});
		return;
	}
	if (take2) {
		throw new Error("Could not load Facebook");
	}
	// Load FB
	window.fbAsyncInit = function() {
		FB.init({
			appId            : C.app.facebookAppId,
			autoLogAppEvents : false,
			xfbml            : false,
			version          : 'v2.9',
			status           : true // auto-check login
		});
		// now try
		take2 = true;
		shareOnFacebook({url, shareText, take2});
	};
	(function(d, s, id){
		let fjs = d.getElementsByTagName(s)[0];
		if (d.getElementById(id)) return;
		let js = d.createElement(s); js.id = id;
		js.src = "//connect.facebook.net/en_US/sdk.js";
		fjs.parentNode.insertBefore(js, fjs);
	}(document, 'script', 'facebook-jssdk'));
	return;
}; // ./shareOnFacebook


const SocialShare = ({charity, donation, shareText}) => {
	if ( ! shareText) {
		shareText = NGO.summaryDescription(charity) || NGO.displayName(charity);
	}
	let lcn = ""+window.location;
	let pageInfo = {
		title: NGO.displayName(charity),
		image: NGO.image(charity),
		desc:	NGO.summaryDescription(charity),
		shareText: shareText
	};
	// TODO make this line nicer
	// TODO just send the charity ID, and load the rest server side, to give a nicer url
	// Also window.location might contain parameters we dont want to share.
	let url = "https://app.sogive.org/share?link="+encURI(lcn)+"&title="+encURI(pageInfo.title)+"&image="+encURI(pageInfo.image)+"&desc="+encURI(pageInfo.desc);
	pageInfo.url = url;

	return (
		<div className='share-social-buttons'>
			<a className='share-social-twitter' 
				href={'https://twitter.com/intent/tweet?text='+encURI(shareText)+'&url='+encURI(url)} data-show-count="none">
				<span className='fa fa-twitter' />
			</a>
			<a className='share-social-facebook' onClick={e => shareOnFacebook(pageInfo)}><span className='fa fa-facebook' /></a>
			<a className='share-social-email' 
				href={'mailto:?subject='+encURI(NGO.displayName(charity)+" shared via SoGive")+'&body='+encURI(window.location)} 
				target='_blank'
			>
				<span className='fa fa-envelope-o' />
			</a>
		</div>);
};

export default SocialShare;

