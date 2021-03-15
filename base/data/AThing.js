import { asDate } from "../utils/miscutils";

/**
 * see AThing.java
 */
class AThing {
	/**
	 * @typedef {String}
	 */
	id;

	/**
	 * @typedef {?String}
	 */
	name;
}

/**
 * 
 * @param {AThing} item 
 * @returns {Date}
 */
AThing.lastModified = item => asDate(item.lastModified);

export default AThing;
