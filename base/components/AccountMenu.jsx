import React from 'react';
import { Nav, NavItem, UncontrolledDropdown, DropdownToggle, DropdownMenu, DropdownItem } from 'reactstrap';
import Login from 'you-again';

import C from '../CBase';
import DataStore from '../plumbing/DataStore';
import {LoginLink, RegisterLink} from './LoginWidget';

// import {XId,yessy,uid} from '../js/util/orla-utils.js';

import Misc from './Misc';

const doLogout = () => {
	Login.logout();
};

/*
The top-right menu
active {boolean} true if on the account page
account {boolean} true if we want to show the account option (true by default), needed by my-loop because it doesn't have an account page but needs logout
logoutLink {string} what page should be loaded after logout ('#dashboard' by default), to allow it to go to the dashboard in portal, but the same page in my-loop
TODO use react for the dropdown state - not bootstrap.js
*/

const AccountMenu = (props) => {
	const isMobile = window.innerWidth <= 767;
	const {noRegister} = (props || {});

	// TODO see navbar dropdown
	if (!Login.isLoggedIn()) {
		return (
			<Nav className="ml-auto" navbar>
				{noRegister ? '' : <NavItem id="register-link"><RegisterLink /></NavItem>}
				<NavItem className="login-link"><LoginLink /></NavItem>
			</Nav>
		);
	}

	let user = Login.getUser();

	return isMobile ? (
		<MobileMenu {...props} user={user} />
	) : (
		<DesktopMenu {...props} user={user} />
	);
};

const DesktopMenu = ({logoutLink, user}) => (
	<Nav className="ml-auto" navbar>
		<UncontrolledDropdown nav inNavbar>
			<DropdownToggle nav caret>{ user.name || user.xid }</DropdownToggle>
			<DropdownMenu>
				<DropdownItem><a href="#account">Account</a></DropdownItem>
				<DropdownItem divider />
				<DropdownItem><a href={logoutLink} onClick={() => doLogout()}>Log out</a></DropdownItem>
			</DropdownMenu>
		</UncontrolledDropdown>
	</Nav>
);

/** Clicking username to expand does not work well on mobile
// Just display all options as part of burger-menu
*/
const MobileMenu = ({logoutLink, user}) => (
	<Nav navbar>
		<NavItem>
			<a href="#account">{ user.name || user.xid }</a>
		</NavItem>
		<NavItem>
			<a href={logoutLink} onClick={() => doLogout()}>Log out</a>
		</NavItem>
	</Nav>
);

export default AccountMenu;
