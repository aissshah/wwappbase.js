/**
 * Profiler sketch API
 * See also the profiler java code
 * Note: use these wrapped by DataStore.fetch
 */

import ServerIO from './plumbing/ServerIOBase';
import {assert, assMatch, assertMatch} from 'sjtest';
// add funky methods to the "standard" Person data-class
import Person from './data/Person';
import PV from 'promise-value';
import {mapkv, encURI, XId} from 'wwutils';
assert(Person);

// for debug
window.Person = Person;

// deprecated -- overlaps with named exports, lets use them instead
const Profiler = {};

/**
 * Use with DataStore
 * @return {promise(Person)}
 */
const getProfile = ({xid, fields, status}) => {
	assMatch(xid, String);
	// NB: dont report 404s
	// NB: the "standard" servlet would be /person but it isnt quite ready yet (at which point we should switch to ServerIO.getDataItem)
	return ServerIO.load(`${ServerIO.PROFILER_ENDPOINT}/profile/${ServerIO.dataspace}/${encURI(xid)}`, {data: {fields, status}, swallow:true});
};

/**
 * Convenience method:
 * Fetch the data for all xids. Return the profiles for those that are loaded.
 * @param {String[]} xids 
 * @returns {Person[]} peeps
 */
const getProfilesNow = xids => {
	assert(_.isArray(xids), "Profiler.js getProfilesNow "+xids);
	xids = xids.filter(x => !!x); // no nulls
	const fetcher = xid => DataStore.fetch(['data', 'Person', xid], () => {
		return getProfile({xid});
	});
	let pvsPeep = xids.map(fetcher);	
	let peeps = pvsPeep.filter(pvp => pvp.value).map(pvp => pvp.value);
	return peeps;
};


/** 
 * TODO refactor to work with Claims as they are, with more specific utility methods. 
 * This returns a similar but conflicting data-format for Claims, which cencourages bugs. 
 * 
 * @returns {gender: {value: 'male', consent: 'private'}, locaton: {value: 'who_knows', consent: 'public'}}
 * Example of Claims object as of 18/10/18
 * {"c": ["controller"], "@class": "com.winterwell.profiler.data.Claim", "t": "2018-10-18T11:14:04Z", "v": "This is Peter Pan, a test account for SoGrow...",
	"f": ["mark@winterwell.com@email"], "k": "description", "kv": "description=This is Peter Pan, a test account for SoGrow...","o": "description-mark@winterwell.com@email"
	}
	TODO: change to getClaimsForPerson instead of getClaimsForXId
 */
const getClaimsForXId = xid => {
	const claims = DataStore.getValue(['data', 'Person', xid, 'claims']);

	if( ! claims ) return;

	const formattedClaims = claims.reduce( (obj, claim) => {
		let {k, f, v, c} = claim;

		// Claims coming from user always take precedence
		// Claims generated by guessBots are considered less reliable than other sources
		const allowOverride = f.includes('myloop@app') || ( obj[k] && obj[k].f.find( source => source.match(/@bot/)));

		// If contains "public", set to true
		// set to false ("private") otherwise
		// Reasoning is that default state is "private"/false anyway
		// Change this to "private" if you want all options checked by default
		if(_.isArray(c)) c = c.includes("public");

		// Only allow override if the claim is coming from the user
		if( !obj[k] || allowOverride ) obj[k] = {value: v, consent: c, f}; 
 
		return obj;
	}, {});
	return _.isEmpty(formattedClaims) ? null : formattedClaims;
};


/**
 * Create UI call for saving claim to back-end
	@param xids {String[]} XId format
	@param claims {Claim[]}
	@returns promise[]
*/ 
const saveProfileClaims = (xids, claims) => {
	if(_.isString(xids)) xids = [xids];

	assMatch(xids, "String[]", "Profiler.js saveProfileClaims xids")
	// assMatch(claims, "Claim[]", "Profiler.js saveProfileClaims() claims");
	
	if( _.isEmpty(claims) ) {
		console.warn('Profiler.js saveProfileClaims -- no claims provided, aborting save');
		return;
	}

	return xids.map( xid => {
		assMatch(xid, String);
		return ServerIO.post(
			`${ServerIO.PROFILER_ENDPOINT}/profile/${ServerIO.dataspace}/${encURI(xid)}`, 
			{claims: JSON.stringify(claims)}
		);
	});
};

/**
 * TODO refactor to use Crud
 * @return PV[]
 */
const saveProfile = (doc) => {
	assert(doc, "Profiler.js - saveProfile "+doc);
	let ids = doc.id || doc.xid;
	// paranoia: ensure array
	if (_.isString(ids)) ids = [ids];
	const pvs = [];
	ids.forEach(xid => {
		assMatch(xid, String, "Profiler.js - saveProfile", doc);		
		let prm = ServerIO.post(`${ServerIO.PROFILER_ENDPOINT}/profile/${ServerIO.dataspace}/${encURI(xid)}`, {action: 'put', doc: JSON.stringify(doc)});			
		pvs.push(PV(prm));
	});
	return pvs;
};

/**
 * The underlying consents model is rich (it can carry more options and audit info). 
 * We mostly want to work with something simple.
 * 
 * TODO dataspace and fields
 * @returns {String: Boolean} never null, empty = apply sensible defaults
 */
const getConsents = ({person, dataspace, fields}) => {
	Person.assIsa(person);
	// convert list-of-strings into a true/false map
	let pmap = {};
	let consents = person.c || [];
	consents.forEach(c => {
		// TODO custom?
		// not?
		if (c[0] === "-") {
			c = c.substr(1);
			pmap[c] = 'no';
		} else {
			pmap[c] = 'yes';
		}
	});
	// done
	return pmap;
};


/**
 * @param consents {String: Boolean}
 * 
 * Does NOT save
 */
const setConsents = ({person, dataspace, consents, fields}) => {
	Person.assIsa(person);
	assert( ! _.isArray(consents), "Profiler.js use a map: "+consents);
	// inverse of getConsents
	let pstrings = mapkv(consents, (k,v) => {
		return v === "yes" ? k : "-"+k;
	});
	// Audit trail of whats changed? TODO manage that server-side.
	person.c = pstrings;
	return person;
};


/**
 * Call AnalyzeDataServlet to fetch and analyse Twitter data.
 * 
 * ??update DataStore here??
 */
const requestAnalyzeData = xid => {
	assMatch(xid, String);
	// NB: analyze is always for the gl dataspace
	return ServerIO.load(ServerIO.PROFILER_ENDPOINT + '/analyzedata/gl/' + escape(xid));
};

/**
 * Post to the /form endpoint which handles adhoc (not necc trusted) form submissions.
 * 
 * NB: posts use YouAgain's Login.sign() -- see ServerIOBase.
 * 
 * @param data {Object} e.g. {email: "foo@bar"} "notify":email is a special field
 */
// NB: copy-paste-improve from invest-in-change form.js
const submitForm = ({data}) => {
	let url = `${ServerIO.PROFILER_ENDPOINT}/form/${ServerIO.dataspace}`;
	// send back referrer and form-page-url info
	data.referrer = document.referrer;
	data.formUrl = ""+window.location
	let p = ServerIO.post(url, {action: 'post', data});			
	return p;
};

/**
 * For share posts to Twitter or Facebook by the user
 * 
 * ??maybe just use gl.via=uxid + a post nonce??
 * 
// Associate the socialShareId with the given user Profile
// Once the ID has become associated with a Profile,
// data on how many people have reached as.good-loop.com via "as.good-loop.com/gl.socialShareId=${SOCIAL_SHARE_ID}"
// will be returned along with other Profile stats
 */
const saveSocialShareId = ({xid, socialShareId, adID, name}) => {
	let ssids = JSON.stringify([{socialShareId, adID, name}]);
	return ServerIO.post(
		`${ServerIO.PROFILER_ENDPOINT}/profile/${ServerIO.dataspace}/${encURI(xid)}`, 
		{socialShareIds: ssids}
		);
};

Person.saveProfileClaims = saveProfileClaims;
Person.getProfile = getProfile;
Person.getProfilesNow = getProfilesNow;
Person.saveProfile = saveProfile;
Person.getConsents = getConsents;
Person.setConsents = setConsents;

Profiler.requestAnalyzeData = requestAnalyzeData;
Profiler.saveSocialShareId = saveSocialShareId;

export {
	saveProfileClaims,
	getClaimsForXId,
	getProfile,
	getProfilesNow,
	saveProfile,
	getConsents,
	setConsents,
	requestAnalyzeData,
	saveSocialShareId,
};
export default Profiler;
