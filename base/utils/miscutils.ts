import _ from 'lodash';
import Enum from 'easy-enums';
import { assert, assMatch } from "./assert";
import printer from './printer';
import PromiseValue from 'promise-value';

// Should we switch back to .js over .ts??

export const randomPick = function <T>(array: T[]): T {
	if (!array) {
		return null;
	}
	if (!array.length) {
		return null;
	}
	let r = Math.floor(array.length * Math.random());
	assert(r < array.length, array);
	return array[r];
};

export const sum = (array: number[]): number => array.reduce((acc, a) => acc + a, 0);

/**
 * Is this a number or number-like?
 * @param {?String|NUmber} value 
 * @returns {Boolean}
 */
// ref: https://stackoverflow.com/questions/18082/validate-decimal-numbers-in-javascript-isnumeric
export const isNumeric = value => {
	return ! isNaN(value - parseFloat(value));
};

/**
 * @returns true for mobile or tablet
 */
export const isMobile = () => {
	// NB: COPIED FROM ADUNIT'S device.js
	const userAgent = navigator.userAgent || navigator.vendor || window.opera;
	let _isMobile = userAgent.match('/mobile|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i');
	return !!_isMobile;
};
/**
 * Bootstrap 2/3-letter screen sizes e.g. "md"
 */
export const KScreenSize = new Enum("xs sm md lg xl xxl");
/**
 * Bootstrap 2/3-letter screen sizes e.g. "md"
 * See https://getbootstrap.com/docs/4.5/layout/overview/#containers
 * @returns {KSreenSize}
 */
export const getScreenSize = () => {
	const w = window.innerWidth;
	if (w < 576) return KScreenSize.xs;
	if (w < 768) return KScreenSize.sm;
	if (w < 992) return KScreenSize.md;
	if (w < 1200) return KScreenSize.lg;
	if (w < 1400) return KScreenSize.xl;
	return KScreenSize.xxl
};

/**  */
export const isPortraitMobile = () => window.matchMedia("only screen and (max-width: 768px)").matches && window.matchMedia("(orientation: portrait)").matches;


/**
 * @returns true if share was invoked, false if copy-to-clipboard was invoked
 */
export const doShare = ({ href, title, text }) => {
	if (!navigator.share) {
		console.warn("No share function");
		copyTextToClipboard(href);
		return false;
	}
	navigator.share({ url: href, title, text });
	return true;
};

function fallbackCopyTextToClipboard(text: string) {
	var textArea = document.createElement("textarea");
	textArea.value = text;

	// Avoid scrolling to bottom
	textArea.style.top = "0";
	textArea.style.left = "0";
	textArea.style.position = "fixed";

	document.body.appendChild(textArea);
	textArea.focus();
	textArea.select();

	try {
		var successful = document.execCommand('copy');
		var msg = successful ? 'successful' : 'unsuccessful';
		console.log('Fallback: Copying text command was ' + msg);
	} catch (err) {
		console.error('Fallback: Oops, unable to copy', err);
	}

	document.body.removeChild(textArea);
}

export function copyTextToClipboard(text: string) {
	if (!navigator.clipboard) {
		fallbackCopyTextToClipboard(text);
		return;
	}
	navigator.clipboard.writeText(text).then(function () {
		console.log('Async: Copying to clipboard was successful!');
	}, function (err) {
		console.error('Async: Could not copy text: ', err);
	});
}

/**
 * Convenience for spacing base-css-class + optional-extra-css-class.
 * Skips falsy, so you can do e.g. `space(test && "value")`.
 * Recursive, so you can pass an arg list or an array OR multiple arrays.
 * @returns {!string} "" if no inputs
 */
export const space = (...strings: string[]) => {
	let js = '';
	if (!strings) return js;
	strings.forEach(s => {
		if (!s) return;
		if (s.forEach && typeof (s) !== 'string') {
			// recurse
			s = space(...s);
			if (!s) return;
		}
		js += ' ' + s;
	});
	return js.trim();
};

/**
 * @param unescapedHash e.g. "foo=bar"
 * This must be the whole post-hash state.
 */
const setHash = function (unescapedHash: string) {
	assert(unescapedHash[0] !== '#', "No leading # please on " + unescapedHash);
	if (history && history.pushState) {
		let oldURL = "" + window.location;
		history.pushState(null, null, '#' + encURI(unescapedHash));
		fireHashChangeEvent({ oldURL });
	} else {
		// fallback for old browsers
		location.hash = '#' + encURI(unescapedHash);
	}
};
/**
 * Note: params will be string valued EXCEPT "true" and "false", which are coerced to booleans.
 * No path will return as []
 * @returns path:string[], params:Object
 */
export const parseHash = function (hash = window.location.hash) {
	let params = getUrlVars(hash);
	// Pop the # and peel off eg publisher/myblog NB: this works whether or not "?"" is present
	let page = hash.substring(1).split('?')[0];
	const path = page.length ? page.split('/').map(decURI) : [];
	return { path, params };
}

/**
 * @param {?String[]} newpath Can be null for no-change
 * @param {?Object} newparams Can be null for no-change
 * @param {?Boolean} returnOnly If true, do not modify the hash -- just return what the new value would be (starting with #)
 */
export const modifyHash = function (newpath: string[], newparams, returnOnly: boolean) {
	const { path, params } = parseHash();
	let allparams = (params || {});
	allparams = Object.assign(allparams, newparams);
	if (!newpath) newpath = path || [];
	let hash = encURI(newpath.join('/'));
	if (yessy(allparams)) {
		let kvs = mapkv(allparams, (k, v) => encURI(k) + "=" + (v === null || v === undefined ? '' : encURI(v)));
		hash += "?" + kvs.join('&');
	}
	if (returnOnly) {
		return '#' + hash;
	}
	if (history && history.pushState) {
		let oldURL = "" + window.location;
		history.pushState(null, null, '#' + hash);
		// generate the hashchange event
		fireHashChangeEvent({ oldURL });
	} else {
		// fallback for old browsers
		location.hash = '#' + hash;
	}
};

let fireHashChangeEvent = function ({ oldURL }) {
	// NB IE9+ on mobile
	// https://developer.mozilla.org/en-US/docs/Web/API/HashChangeEvent
	let e = new HashChangeEvent('hashchange', {
		newURL: "" + window.location,
		oldURL: oldURL
	});
	window.dispatchEvent(e);
};

/**
 * Map fn across the (key, value) properties of obj.
 * 
 * Or you could just use Object.entries directly -- but IE doesn't support it yet (Jan 2019)
 * 
 * @returns {Object[]} array of fn(key, value)
 */
export const mapkv = function (obj, fn) {
	return Object.keys(obj).map(k => fn(k, obj[k]));
};

/**
 * Strip commas £/$/euro and parse float.
 * @param {Number|String} v 
 * @returns Number. undefined/null/''/false/NaN are returned as undefined. 
 * Bad inputs also return undefined (this makes for slightly simpler usage code
 *  -- you can't test `if (x)` cos 0 is falsy, but you can test `if (x!==undefined)`)
 */
export const asNum = (v: string | number | null): number | null => {
	if (v === undefined || v === null || v === '' || v === false || v === true || Number.isNaN(v)) {
		return undefined;
	}
	if (_.isNumber(v)) return v;
	// strip any commas, e.g. 1,000
	if (_.isString(v)) {
		v = v.replace(/,/g, "");
		// £ / $ / euro
		v = v.replace(/^(-)?[£$\u20AC]/, "$1");
	}
	// See https://stackoverflow.com/questions/12227594/which-is-better-numberx-or-parsefloatx
	const nv = +v;
	if (Number.isNaN(nv)) {
		return null; // bad string input
	}
	return nv;
};

/**
 * Is it an array? undefined? a single value? Whatever -- give me an array.
 * @param {?any} hm If null/undefined/"", return []
 * @returns {Object[]} 
 */
export const asArray = (hm: any): Object[] => {
	if (!is(hm) || hm === "") return [];
	if (_.isArray(hm)) return hm;
	return [hm];
};

/**
 * @param {!string} src url for the script
 * @param {?Function} onload called on-load and on-error
 * @param {?dom-element} domElement append to this, or to document.head
 * NB: copy-pasta of Good-Loop's unit.js addScript()
 */
export const addScript = function ({ src, async, onload, onerror, domElement }) {
	let script = document.createElement('script');
	script.setAttribute('src', src);
	if (onerror) script.addEventListener('error', onerror);
	if (onload) script.addEventListener('load', onload);
	script.async = async;
	script.type = 'text/javascript';
	// c.f. https://stackoverflow.com/questions/538745/how-to-tell-if-a-script-tag-failed-to-load
	// c.f. https://stackoverflow.com/questions/6348494/addeventlistener-vs-onclick
	if (!domElement) {
		let head = document.getElementsByTagName("head")[0];
		domElement = (head || document.body);
	}
	domElement.appendChild(script);
};

/**
	 * A more flexible (and dangerous) version of substring.
	 * 
	 * @param {string} mystring
	 *            Can be null, in which case null will be returned
	 * @param {!number} start
	 *            Inclusive. Can be negative for distance from the end.
	 * @param {?number} end
	 *            Exclusive. Can be null for "up to the end". Can be negative for distance from the end. E.g. -1
	 *            indicates "all but the last character" (zero indicates
	 *            "up to the end"). Can be longer than the actual string, in
	 *            which case it is reduced. If end is negative and too large, an
	 *            empty string will be returned.
	 * @returns {?string} The chopped string. null if the input was null. The empty string
	 *         if the range was invalid.
	 */
export const substr = (mystring: string, _start: number, _end: number) => {
	if (!mystring) return mystring;
	// keep the original values around for debugging
	let start = _start;
	let end = _end || 0;
	const len = mystring.length;
	// start from end?
	if (start < 0) {
		start = len + start;
		if (start < 0) {
			start = 0;
		}
	}
	// from end?
	if (end <= 0) {
		end = len + end;
		if (end < start) {
			return "";
		}
	}
	assert(end >= 0, start + " " + end);
	// too long?
	if (end > len) {
		end = len;
	}
	// OK
	if (start == 0 && end == len)
		return mystring;
	if (end < start) {
		console.warn("substr() - Bogus start(" + _start + ")/end(" + _end + " for " + mystring);
		return "";
	}
	assert(start >= 0 && end >= 0, start + " " + end);
	return mystring.substring(start, end);
};

/**
 * 
 * @param {?String} url Defaults to window.location.hostname
 * @returns {!String} e.g. "bbc.co.uk", "google.com", etc.
 */
export const getDomain = (url) => {
	if ( ! url) url = window.location.hostname;
	let m = url.match(/^(?:.*?\.)?([a-zA-Z0-9\-_]{3,}\.(?:\w{2,8}|\w{2,4}\.\w{2,4}))$/);
	if ( ! m) {	// safety / paranoia
		console.error("getDomain() error for "+url);
		return url;
	}
	return m[1];
};




/** Parse url arguments
 * @param {?string} url Optional, the string to be parsed, will default to window.location when not provided.
 * @param {?Boolean} lenient If true, if a decoding error is hit, it is swallowed and the raw string is used.
 * Use-case: for parsing urls that may contain adtech macros.
 * @returns a map */
// NB: new UrlSearchParams(searchFragment) can now do much of this
export const getUrlVars = (url: string, lenient: boolean) => {
	// Future thought: Could this be replaced with location.search??
	// Note: location.search doesn't look past a #hash
	url = url || window.location.href;
	// url = url.replace(/#.*/, ''); Why was this here?! DW
	var s = url.indexOf("?");

	if (s == -1 || s == url.length - 1) return {};

	var varstr = url.substring(s + 1);
	var kvs = varstr.split("&");
	var urlVars = {};

	for (var i = 0; i < kvs.length; i++) {
		var kv = kvs[i];
		if (!kv) continue; // ignore trailing &
		var e = kv.indexOf("=");
		if (e == -1) {
			continue;
		}
		let k = kv.substring(0, e);
		k = k.replace(/\+/g, ' ');
		k = decURI(k);
		let v = null; //'';
		if (e === kv.length - 1) continue;
		v = kv.substring(e + 1);
		v = v.replace(/\+/g, ' ');
		try {
			v = decURI(v);
		} catch (err) {
			if (!lenient) throw err;
			console.warn("const js getUrlVars() decode error for " + kv + " " + err);
		}
		// hack for boolean
		if (v === 'true') v = true; if (v === 'false') v = false;
		urlVars[k] = v;
	}

	return urlVars;
};

export const setUrlParameter = (url: string, key: string, value: any) => {	
	assMatch(url, String, "setUrlParameter null url key:"+key);
	if ( ! is(value)) {
		return url;
	}
	let newUrl = url.includes("?")? url+"&" : url+"?";
	newUrl += encURI(key)+"="+encURI(value);
	return newUrl;
};

const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
/**
	Validate email addresses using what http://emailregex.com/ assures me is the
	standard regex prescribed by the W3C for <input type="email"> validation.
	https://www.w3.org/TR/html-markup/input.email.html#input.email.attrs.value.single
	NB this is more lax
	@param string A string which may or may not be an email address
	@returns True if the input is a string & a (probably) legitimate email address.
*/
export const isEmail = function (s: string): boolean {
	return !! ("string" === typeof(s) && s.match(emailRegex));
}



/**
Like truthy, but {}, [] amd [''] are also false alongside '', 0 and false.
*/
export const yessy = function (val: any): boolean {
	if (!val) return false;
	if (typeof (val) === 'number' || typeof (val) === 'boolean') {
		return true;
	}
	if (typeof (val) === 'object' && val.length === undefined) {
		assert(typeof (val) !== 'function', "yessy(function) indicates a mistake: " + val);
		val = Object.getOwnPropertyNames(val);
	}
	if (val.length === 0) {
		return false;
	}
	if (val.length) {
		for (let i = 0; i < val.length; i++) {
			if (val[i]) return true;
		}
		return false;
	}
	return true;
};

/**
 * convenience for not-null not-undefined (but can be false, 0, or "")
 */
export const is = (x: any) => x !== undefined && x !== null;


const getStackTrace = function () {
	try {
		const stack = new Error().stack;
		// stacktrace, chop leading "Error at Object." bit
		let stacktrace = ("" + stack).replace(/\s+/g, ' ').substr(16);
		return stacktrace;
	} catch (error) {
		// oh well
		return "";
	}
}

/**
 * @return {string} a unique ID
 */
export const uid = function () {
	// A Type 4 RFC 4122 UUID, via http://stackoverflow.com/a/873856/346629
	var s = [];
	var hexDigits = "0123456789abcdef";
	for (var i = 0; i < 36; i++) {
		s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
	}
	s[14] = "4";  // bits 12-15 of the time_hi_and_version field to 0010
	s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1);  // bits 6-7 of the clock_seq_hi_and_reserved to 01
	s[8] = s[13] = s[18] = s[23] = "-";
	var uuid = s.join("");
	return uuid;
};

//** String related functions */

/** Uppercase the first letter, lowercase the rest -- e.g. "dan" to "Daniel" */
export const toTitleCase = function (s: string) {
	if (!s) return s;
	return s[0].toUpperCase() + s.substr(1).toLowerCase();
}

/**
 * Truncate text length.
 */
export const ellipsize = function (s: string, maxLength: number) {
	if (!s) return s;
	if (!maxLength) maxLength = 140;
	if (s.length <= maxLength) return s;
	return s.substr(0, maxLength - 1) + '…'; // NB: React doesn't render html entities, so lets use a unicode ellipsis.
};

/**
 * e.g. winterwell.com from http://www.winterwell.com/stuff
 */
export const getHost = function (url: string): string {
	var a = document.createElement('a');
	a.href = url;
	var host = a.hostname;
	if (host.startsWith("www.")) host = host.substr(4);
	return host;
}

export const getLogo = (item:any) : string => {
	if (!item) return null;
	// HACK ads store logo under item.branding.logo
	// Kept old syntax in as back-up / more generic
	let img = (item.branding && item.branding.logo) || item.logo || item.img || item.photo || (item.std && item.std.img);
	if (!img) return null;
	// If its an ImageObject then unwrap it
	if (img.url) img = img.url;
	return img;
};



/**
 * Make an option -> nice label function
 * @param options 
 * @param {?String[]|Object|Function} labels Can be falsy
 * @returns {Function} option to label
 */
export const labeller = function (options: Object[], labels: any) {
	if (!labels) return fIdentity;
	if (_.isArray(labels)) {
		return v => labels[options.indexOf(v)] || v;
	} else if (_.isFunction(labels)) {
		return labels;
	}
	// map
	return v => labels[v] || v;
};
const fIdentity = (x: any) => x;

/** 
 * Encoding should ALWAYS be used when making html from json data.
 * 
 * There is also CSS.escape() in the file css.escape.js for css selectors, 
 * which we get from https://developer.mozilla.org/en-US/docs/Web/API/CSS.escape
 * and may become a standard.
 * 
 */

/** Url-encoding: e.g. encode a parameter value so you can append it onto a url.
 * 
 * Why? When there are 2 built in functions:
 * 
 * 1. escape() robust but doesn't handle unicode. 
 * 2. encodeURIComponent() has better unicode handling -- however it doesn't escape 's which makes it dangerous, 
 * and it does (often unhelpfully) encode /s and other legitimate url characters.
 
 This is a super-solid best-of-both.
*/
export const encURI = function (urlPart: string) {
	urlPart = encodeURIComponent(urlPart);
	urlPart = urlPart.replace(/'/g, "%27");
	// Keep some chars which are url safe
	urlPart = urlPart.replace(/%2F/g, "/");
	return urlPart;
}

export const decURI = function (urlPart: string) {
	let decoded = decodeURIComponent(urlPart);
	return decoded;
}

/**
 * @param {Date} d
 * @return {String} iso format e.g. 2020-10-18
 */
export const isoDate = (d: Date) => d.toISOString().replace(/T.+/, '');

/**
 * preventDefault + stopPropagation
 * @param e {?Event|Object} a non-event is a no-op 
 * @returns true (so it can be chained with &&)
 */
export const stopEvent = (e: Event) => {
	if (!e) return true;
	if (e.preventDefault) {
		try {
			e.preventDefault();
			e.stopPropagation();
		} catch (err) {
			console.warn("(swallow) stopEvent cant stop", e, err);
		}
	}
	return true;
};

/**
 * 
 * @param x Convert anything to a string in a sensible-ish way.
 * 
 * Minor TODO: refactor printer.js to use `export` and use that directly
 */
export const str = x => printer.str(x)

/**
 * @param {?String|Date} s 
 * @returns {?Date}
 */
export const asDate = (s: String|Date) => {
	if (!s) return null;
	if (typeof(s)==="string") return new Date(s);
	return s;
};

/**
 * Create a debounced function - which returns a PromiseValue.
 * This differs from plain debounce which returns null (as the function hasn't been called yet);
 * Use-case: debounce with promise-style .then() follow-on code
 * @param fn Do the thing!
 * @param msecs Milliseconds to wait in debounce
 */
export const debouncePV = (fn: Function, msecs: Number) => {
	let pv = PromiseValue.pending();
	const rpv = { ref: pv };
	// debounce and resolve the PV
	let dfn = _.debounce((...args: any[]) => {
		try {
			let p = fn(...args);
			if (!p || !p.then) {
				rpv.ref.resolve(p);
				return;
			}
			p.then((res: any) => {
				rpv.ref.resolve(res);
				// fresh pv for future calls
				rpv.ref = PromiseValue.pending();
			}, (err: any) => {
				rpv.ref.reject(err);
				// fresh pv for future calls
				rpv.ref = PromiseValue.pending();
			});
		} catch (err) {
			rpv.ref.reject(err);
		}
	}, msecs);
	// return the PV
	let dfnpv = (...args: any[]) => {
		dfn(...args);
		return rpv.ref;
	};
	return dfnpv;
};

/**
 * Convenience to de-dupe and remove falsy from an array
 * @param {Object[]} array 
 * @returns {Object[]} copy of array
 */
export const uniq = (array : Object[]) : Object[] => {
	return [... new Set(array.filter(x => x))];
};

/**
 * Convenience to de-dupe and remove falsy from an array
 * @param {Object[]} array 
 * @param {?Function} keyFn Defaults to .id
 * @returns {Object[]} copy of array, de-duped by id. Falsy items and falsy ids are filtered out
 */
export const uniqById = (array: Object[], keyFn: Function) : Object[] => {
	if ( ! keyFn) keyFn = item => item && item.id;
	let item4id = {};
	array.forEach(item => {
		let key = keyFn(item);
		if ( ! key) return;
		item4id[key] = item;
	});
	return Object.values(item4id);
};

/**
 * Convert a keyset {name:bool} type object to an array
 * @param {Object} keysetObj 
 */
export const keysetObjToArray = (keysetObj : Object) => {
	return Object.keys(keysetObj).filter(item => keysetObj[item]);
};

/**
 * Convert an array of objects with ids to a list of ids
 * @param {?Array} idObjArray 
 */
export const idList = (idObjArray : Object[]) => {
	return idObjArray ? idObjArray.map(obj => obj.id) : [];
};

/**
 * Gives the appropriate indefinite article for an English noun.
 * Wrote this because I was sick of seeing the advert list tell me "To create a Advert, first pick a Advertiser". -Roscoe
 * @param {Object} noun An object which will be coerced to a string and checked for an initial vowel
 * @returns {String} "a" or "an", as appropriate for the supplied noun.
 */
export const article = (noun: Object) => ('aeiou'.indexOf(String(noun).toLowerCase()[0]) >= 0) ? 'an' : 'a';

/**
 * 
 * @param {?String} text 
 * @returns {!String} lowercase, trim, strip punctuation and other non-letters, and compact whitespace.
 */
export const toCanonical = (text: String) => {
	if ( ! text) return "";
	return text.trim().toLowerCase().replaceAll(/\W+/g, " ");
};
