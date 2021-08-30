import React, { Component } from 'react';
import Login from '../youagain';

import { getUrlVars, toTitleCase, modifyHash, yessy } from '../utils/miscutils';
import { Alert, Container } from 'reactstrap';
import { isFunction } from 'lodash';
// setup Misc.SavePublishDiscard for older code
import SavePublishDeleteEtc from './SavePublishDeleteEtc';

// Plumbing
import DataStore from '../plumbing/DataStore';
import Roles from '../Roles';
import C from '../../C';
import Misc from './Misc';
import Share from '../data/Share';
import ServerIO from '../plumbing/ServerIOBase';

// Templates
import MessageBar from './MessageBar';
import NavBar from './NavBar';
import LoginWidget, { LoginPage, setShowLogin } from './LoginWidget';
import { BasicAccountPage } from './AccountPageWidgets';

import E404Page from './E404Page';
import { assert } from '../utils/assert';
import PropControls from './PropControls';

let dummy = PropControls; // keep the PropControls import

// DataStore
C.setupDataStore();
DataStore.update({
	data: {
	},
});

// Set up login + watcher here, at the highest level
// But after app code finishes loading (so use a timeout)
let initFlag = false;
const init = () => {
	if (initFlag) return;
	initFlag = true;

	// HACK old setup (id is preferred to match App.java)
	if ( ! C.app.id) C.app.id = C.app.service;
	if (C.app.id) {
		C.app.service = C.app.id;
	}

	Login.app = C.app.id || C.app.service;
	Login.dataspace = C.app.dataspace;

	Login.change(() => {
		// ?? should we store and check for "Login was attempted" to guard this??
		if (Login.isLoggedIn()) {
			// close the login dialog on success		
			setShowLogin(false);
		}
		// poke React via DataStore (e.g. for Login.error)
		DataStore.update({});		
	});
	// Are we logged in?
	Login.verify();
};


/**
	WARNING: This element will update on changes ...but the calling MainDiv most likely will *not*.
	So the props will remain fixed.

	props:

	homelink: {String} - Relative url for the home-page. Defaults to "/"
	pageForPath: {String:JSX}
	navbarPages: String[]|() => String[]
	navbarExternalLinks: {?Object}
	navbarDarkTheme: {?boolean}
	navbarBackgroundColour: {?String}
	loginRequired: {?boolean}
	securityCheck: ({page}) => throw error / return true
	SecurityFailPage: ?JSX
	defaultPage: String,
	fullWidthPages: String[]
*/
class MainDivBase extends Component {
	// React 16 has deprecated componentWillMount; React 17 will remove the unaliased version.
	// TODO We can probably accomplish all this with a functional component and hooks now.
	componentDidMount() {
		// redraw on change
		const updateReact = (mystate) => this.setState({});
		DataStore.addListener(updateReact);
	}

	componentDidCatch(error, info) {
		// Display fallback UI
		this.setState({error, info, errorPath: DataStore.getValue('location', 'path')});
		console.error(error, info);
		if (window.onerror) window.onerror("Caught error", null, null, null, error);
	}

	render() {
		init();
		let {
			homeLink,
			pageForPath, 
			navbarPages, navbarLabels, navbarChildren, navbarExternalLinks,
			securityCheck, SecurityFailPage=DefaultErrorPage, 
			loginRequired,
			defaultPage,
			navbar=true, // false for no navbar!
			navbarDarkTheme=true,
			navbarBackgroundColour="dark",
			fullWidthPages,
			noRegister,			
		} = this.props;
		// navbarPages might be a getter function (needed for a dynamic list) - so the invoking MainDiv can
		// have a dynamic nav page list without being connected to the store itself.
		if (isFunction(navbarPages)) {
			navbarPages = navbarPages();
		}
		if ( ! navbarPages) navbarPages = Object.keys(pageForPath);

		// which page?
		let path = DataStore.getValue('location', 'path');
		let page = (path && path[0]);
		if ( ! page) {
			// defaultPage may be dynamic
			if (isFunction(defaultPage)) defaultPage = defaultPage();
			if (defaultPage) {
				setTimeout(() => modifyHash([defaultPage]), 1); // let the next render get it
			}			
			return <Alert color="warning">No page specified - and the app does not set a default</Alert>;
		}
		assert(page);

		let Page = pageForPath[page];
		if ( ! Page) {
			// basic account?
			if (page === 'account') Page = BasicAccountPage;
			else {
				Page = E404Page;
			}
		}
		// error handler
		if (this.state && this.state.error && this.state.errorPath === path) {
			Page = DefaultErrorPage;
		}
		// must login?
		if (loginRequired && ! Login.isLoggedIn()) {
			Page = LoginPage;
		} else if (securityCheck) {
			try {
				securityCheck({page});
			} catch(err) {
				Page = () => <SecurityFailPage error={err} />;
			}
		}
		// full screen?
		// Either by page, or for a dynamic setting within a page - HACK set window.fullWidthPage=true/false
		let fluid = (fullWidthPages && fullWidthPages.includes(page)) || window.fullWidthPage;
		//
		return (
      <div>
        {navbar ? (
          <NavBar
            page={page}
            pages={navbarPages}
            labels={navbarLabels}
            externalLinks={navbarExternalLinks}
			homelink={homeLink}
            darkTheme={navbarDarkTheme}
            backgroundColour={navbarBackgroundColour}
			children={navbarChildren}
          ></NavBar>
        ) : null}
        <Container fluid={fluid}>
          <MessageBar />
          <div className="page" id={page}>
            <Page />
          </div>
        </Container>
        <LoginWidget
          title={`Welcome to ${C.app.name}`}
          noRegister={noRegister}
          services={noRegister ? [] : undefined}
        />
      </div>
    );
	} // ./render()
} // ./MainDiv


const DefaultErrorPage = ({error}) => (
	<div>
		<h3 className="mt-2">There was an Error :&#39;(</h3>
		<p>Try navigating to a different tab, or reloading the page. 
			If this problem persists, please contact support.</p>
		<p>
			{error && error.message}
			<br /><br />
			<small>{error && error.stack}</small>
		</p>
	</div>);

export default MainDivBase;
