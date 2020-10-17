import React, { useState } from 'react';
import { assMatch } from '../utils/assert';
import { space, stopEvent } from '../utils/miscutils';

/*
 * Events fired on the draggable target (the source element):
ondragstart - occurs when the user starts to drag an element
ondrag - occurs when an element is being dragged
ondragend - occurs when the user has finished dragging the element

Events fired on the drop target:
ondragenter - occurs when the dragged element enters the drop target
ondragover - occurs when the dragged element is over the drop target
ondragleave - occurs when the dragged element leaves the drop target
ondrop - occurs when the dragged element is dropped on the drop target

 */

const dragstate = {
	dragging: null, // id for drag target
	drops: [],	
	dragover: null // id for drop target which we are over
};
// for debug
window.dragstate = dragstate;

const getDragId = e => {
	// e.dataTransfer.getData("id"
	return dragstate.dragging;
};
/**
 * 
 * @param {!Event} e 
 * @param {?String} id 
 */
const setDragId = (e, id) => {
	dragstate.dragging = id;
	// e.dataTransfer.setData("id",id);
	// IE??
	// e.dataTransfer.setData("text/plain",id);
	// touch events dont have dataTransfer
};

let _logOnceKeys = {};
setInterval(() => {
	_logOnceKeys = {};
	// console.log("logOnce - Keys cleared");
}, 10000);
const logOnce = (...args) => {
	let key = args[0];
	if (_logOnceKeys[key]) return;
	_logOnceKeys[key] = true;
	console.log(...args);
};

// must preventDefault to allow drag
const _onDragOver = (e, id) => {
	// TODO check for validity
	stopEvent(e);
	dragstate.dragover = id;
	let dragid = getDragId(e);
	console.log('onDragOver', dragstate.dragging, id, dragid, e);
};

// must preventDefault to allow drag
const _onDragEnter = (e, id) => {
	dragstate.dragover = id;
	let dragid = getDragId(e);
	// TODO check for validity
	stopEvent(e);
	console.log('onDragEnter', dragstate.dragging, id, dragid, e);
};

const _onDragLeave = (e, id, onDragLeave) => {
	if (dragstate.dragover === id) dragstate.dragover = null;
	let dragid = getDragId(e);
	if (onDragLeave) onDragLeave(e, id, dragid);
};

const _onDragExit = (e, id) => {
	if (dragstate.dragover === id) dragstate.dragover = null;
	let dragid = getDragId(e);
	// TODO check for validity
	stopEvent(e);
	console.log('onDragExit', dragstate.dragging, id, dragid, e);
};

class DropInfo {
	/** @type {String} */
	dropzone;	
	/** @type {String} */
	draggable;
	/** ?? */
	x;
	y;
	screenX;
	screenY;
	clientX;
	clientY;
}

/**
 * Update dragstate.drops
 * @param onDrop {?Function} (Event, DropInfo) => do-stuff
 */
const _onDrop = (e, id, onDrop, el) => {
	stopEvent(e);
	dragstate.dragover = null;
	let dragid = getDragId(e);
	console.log('onDrop', el, "this", this, id, dragid, dragstate.dragging);
	setDragId(e, null);
	let x = e.clientX - window.pageXOffset;
	let y = e.clientY - window.pageYOffset;
	const drop = {dropzone:id, draggable:dragid,
		x, y, screenX:e.screenX, screenY:e.screenY,
		clientX:e.clientX, clientY:e.clientY};
	dragstate.drops.push(drop);
	if (onDrop) onDrop(e, drop);
};

const _onDragStart = (e, id, onDragStart) => {	
	console.log('onDragStart', id);
	setDragId(e,id);
	if (onDragStart) onDragStart();
};

const _onDragEnd = (e, id, onDragEnd) => {
	console.log('onDragEnd', id);
	dragstate.dragover = null;
	setDragId(e, null);
	if (onDragEnd) onDragEnd();
};

// https://mobiforge.com/design-development/html5-mobile-web-touch-events
/**
 * Wrap an element to make it draggable to a DropZone.
 * @param {*} param0 
 */
const Draggable = ({children, id, onDragStart, onDragEnd, className}) => {
	assMatch(id, String);
	className = className? className+' Draggable' : 'Draggable';
	return (<div className={className} id={id}
		draggable
		onDragStart={e => _onDragStart(e, id, onDragStart)}
		onDragEnd={e => _onDragEnd(e, id, onDragEnd)}
		onDragLeave={e => _onDragLeave(e, id)}
		onTouchStart={e => {
			var touch = e.targetTouches[0];
			console.log('touchstart', e, touch, JSON.stringify(touch));
			_onDragStart(e, id, onDragStart);
			// // Place element where the finger is
			// draggable.style.left = touch.pageX-25 + 'px';
			// draggable.style.top = touch.pageY-25 + 'px';
			// e.preventDefault();
		}}
		onTouchMove={e => {
			let touch = e.targetTouches[0];
			logOnce('touchmove', e, touch, JSON.stringify(touch));
			let $div = touch && touch.target
			// // Place element where the finger is
			if ($div && $div.style) {
				$div.style.left = touch.pageX-25 + 'px';
				$div.style.top = touch.pageY-25 + 'px';
			}
			// is there a DropZone underneath?

			stopEvent(e);
		}}
		onTouchCancel={e => {
			let touch = e.targetTouches[0];
			console.log('touchCancel', e, touch, JSON.stringify(touch));
			_onDragLeave(e, id);
		}}
		onTouchEnd={e => {
			let touch = e.targetTouches[0];
			console.log('touchEnd', e, touch, JSON.stringify(touch));
			// is there a DropZone underneath?

			_onDragEnd(e, id, onDragEnd);
		}}
		>
		{children}
	</div>);
};

/**
 * @param {!String} id identify this dropzone in the dragstate / drop info
 * @param {?Function} onDrop Called if there is a drop here. (e, dropInfo) => do-stuff
 */
const DropZone = ({id, children, onDrop}) => {
	return (<div className={space("DropZone", id && dragstate.dragover===id && "dragover")} id={id}
		onDragOver={e => _onDragOver(e, id)}
		onDragEnter={e => _onDragEnter(e,id)}
		onDragExit={e => _onDragExit(e,id)}
		onDrop={e => _onDrop(e, id, onDrop, this)}
		>
		{children}
	</div>);
};

export {
	Draggable,
	DropZone,
	dragstate,
	DropInfo
}
