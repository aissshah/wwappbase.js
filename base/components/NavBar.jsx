import React, { useState } from 'react';
import { Navbar, NavbarBrand, NavbarToggler, NavItem, NavLink, Collapse, Nav, Container } from 'reactstrap';

import AccountMenu from './AccountMenu';
import C from '../CBase';
import DataStore from '../plumbing/DataStore';
import { encURI, labeller } from '../utils/miscutils';
import { getDataItem } from '../plumbing/Crud';
import KStatus from '../data/KStatus';


class NavProps {
	pageLinks;	
	currentPage; 
	children;
	/**
	 * @type {?Boolean}
	 */
	darkTheme;
	/**
	 * @type {?String} a BS colour
	 */
	backgroundColour;
	homelink; 
	isOpen; 
	toggle; 

	/**
	 * @type {?String} url for 2nd brand home page
	 */
	brandLink; 
	/**
	 * @type {?String} logo for 2nd brand
	 */
	brandLogo; 
	/**
	 * @type {?String} name for 2nd brand
	 */
	brandName;
};

/**
 * 
 * @param {NavProps} props 
 */
export const setNavProps = (props) => {
	DataStore.setValue(['widget','NavBar'], props, false);
};

const getNavProps = () => DataStore.getValue(['widget','NavBar']) || DataStore.setValue(['widget','NavBar'], {}, false);

/**
 * rendered within BS.Nav
 * @param {NavProps} p
 */
const DefaultNavGuts = ({pageLinks, currentPage, children, homelink, isOpen, toggle, brandLink, brandLogo, brandName}) => {
	return (
	<Container>
		<NavbarBrand title="Dashboard" href={homelink || '/'}>
			<img className='logo-sm' alt={C.app.name} src={C.app.homeLogo || C.app.logo} />
		</NavbarBrand>
		{brandLink && (brandLogo || brandName) && // a 2nd brand?
			<NavbarBrand className="nav-brand" title={brandName} href={brandLink}>
				{brandLogo? <img className='logo-sm' alt={brandName} src={brandLogo} /> : brandName}
			</NavbarBrand>
		}
		<NavbarToggler onClick={toggle}/>
		<Collapse isOpen={isOpen} navbar>
			<Nav navbar>
				{pageLinks}
			</Nav>
			{children}
			<AccountMenu active={currentPage === 'account'} />
		</Collapse>
	</Container>
	);
	};


/**
 * @param {NavProps} props
 * @param {?String} currentPage e.g. 'account' Read from window.location via DataStore if unset.
 * @param {?String} homelink Relative url for the home-page. Defaults to "/"
 * @param {String[]} pages
 * @param {?Object} externalLinks Map page names to external links.
 * @param {?String[]|Function|Object} labels Map options to nice strings.
 * @param {?boolean} darkTheme Whether to style navbar links for a dark theme (use with a dark backgroundColour)
 * @param {?String} backgroundColour Background colour for the nav bar.
 */
const NavBar = ({NavGuts = DefaultNavGuts, ...props}) => {
	// allow other bits of code (i.e. pages below MainDiv) to poke at the navbar
		
	const navProps = getNavProps();
	if (navProps) {
		props = Object.assign({}, props, navProps);
	}
	let {currentPage, pages, labels, externalLinks, darkTheme, backgroundColour, children} = props; // ??This de-ref, and the pass-down of props to NavGuts feels clumsy/opaque
	const labelFn = labeller(pages, labels);

	// Handle nav toggling
	const [isOpen, setIsOpen] = useState(false);
	const close = () => setIsOpen(false);
	const toggle = () => setIsOpen(!isOpen);

	// Fill in current page by inference from location
	if (!currentPage) {
		let path = DataStore.getValue('location', 'path');
		currentPage = path && path[0];
	}
	
	// make the page links
	const pageLinks = pages.map(page => {
		let pageLink = `#${page}`;
		if (externalLinks && page in externalLinks) pageLink = externalLinks[page];
		return( <NavItem key={`navitem_${page}`} active={page === currentPage}>
			<NavLink href={pageLink} onClick={close} >
				{labelFn(page)}
			</NavLink>
		</NavItem>)
	});

	return (
		<Navbar sticky="top" dark={darkTheme} light={!darkTheme} color={backgroundColour} expand="md" className='p-1'>
			<NavGuts {...props} pageLinks={pageLinks} isOpen={isOpen} toggle={toggle} />
		</Navbar>
	);
};
// ./NavBar


const CONTEXT = {};

export const setNavContext = (type, id, processLogo) => {
	CONTEXT[type] = id;
	if ( ! processLogo) return;
	// process for 2nd logo
	let pvAdvertiser = id && getDataItem({type, id, status:KStatus.PUB_OR_DRAFT, swallow:true});
	const advertiser = pvAdvertiser && pvAdvertiser.value;	
	if ( ! advertiser) {		
		setNavProps({brandLink:null,brandLogo:null,brandName:null}); // reset blank
		return;
	}

	let nprops = { // advertiser link and logo
		brandLink:'/#'+type.toLowerCase()+'/'+encURI(id), // HACK assumes our #type url layout
		// prefer white silhouette for safe colours vs backdrop
		brandLogo: (advertiser.branding && (advertiser.branding.logo_white || advertiser.branding.logo)) || advertiser.logo, // HACK assumes branding object
		brandName: advertiser.name || id
	};
	setNavProps(nprops);
};

/**
 * 
 * @param {C.TYPES} type 
 * @returns {?String} id
 */
export const getNavContext = (type) => {
	return CONTEXT[type];
};

export default NavBar;
export {
	NavProps
}
