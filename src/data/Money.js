/**
	Money NB: based on the thing.org type MonetaryAmount
*/
import {assert} from 'sjtest';

import {isa} from './DataClass';
import C from '../C';

/** impact utils */
const Money = {};
const This = Money;
export default Money;

/* 

{
	currency: {String}
	value: {String|Number} The Java backend stores values as String and uses BigDecimal to avoid numerical issues.
	The front end generally handles them as Number, but sometimes as String.
}

*/

// ref: https://stackoverflow.com/questions/18082/validate-decimal-numbers-in-javascript-isnumeric
const isNumeric = value => {
	return ! isNaN(value - parseFloat(value));
};

/**
 * 
 * @param {?Money} ma 
 * @returns {Number}
 */
Money.value = ma => {
	if ( ! ma) return 0;
	if ( ! ma.value) {
		// Patch bad server data?
		if (ma.value100) ma.value = ma.value100 / 100;
		else return 0;
	}
	return parseFloat(ma.value);
};

// duck type: needs a value
Money.isa = (obj) => {
	if ( ! obj) return false;
	if (isa(obj, C.TYPES.Money)) return true;
	if (isa(obj, C.TYPES.MonetaryAmount)) return true; // old data!
	// allow blank values
	if (isNumeric(obj.value) || obj.value==='') return true;
};

Money.assIsa = (obj) => assert(Money.isa(obj), "Money.js - "+JSON.stringify(obj));

Money.make = (base = {}) => {
	const item = {
		value: 0, // default
		currency: 'GBP', // default
		...base, // Base comes after defaults so it overrides
		'@type': C.TYPES.Money, // @type always last so it overrides any erroneous base.type
	};

	Money.assIsa(item);
	return item;
};

// Will fail if not called on 2 Moneys of the same currency
Money.add = (amount1, amount2) => {
	Money.assIsa(amount1);
	Money.assIsa(amount2);
	assert(amount1.currency === amount2.currency);
	return Money.make({
		...amount1,
		value: amount1.value + amount2.value,
	});
};

// Will fail if not called on 2 Moneys of the same currency
Money.sub = (amount1, amount2) => {
	Money.assIsa(amount1);
	Money.assIsa(amount2);
	assert(amount1.currency === amount2.currency);
	return Money.make({
		...amount1,
		value: amount1.value - amount2.value,
	});
};

/** Must be called on a Money and a scalar */
Money.mul = (amount, multiplier) => {
	Money.assIsa(amount);
	assert(isNumeric(multiplier), "Money.js - mul() "+multiplier);
	// TODO Assert that multiplier is numeric (kind of painful in JS)
	return Money.make({
		...amount,
		value: amount.value * multiplier,
	});
};

/** 
 * Called on two Moneys
 * @returns {Number}
 */
Money.divide = (total, part) => {
	Money.assIsa(total);
	Money.assIsa(part);
	assert(total.currency === part.currency, "Money.js divide "+total.currency+" != "+part.currency);
	return Money.value(total) / Money.value(part);
};
