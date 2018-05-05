/*
	Copying a little bit of react-table
	Because react-table was causing my system to crash.
	See https://github.com/react-tools/react-table#example
*/

import React from 'react';
import ReactDOM from 'react-dom';

import SJTest, {assert, assMatch} from 'sjtest';
import _ from 'lodash';
import Misc from './Misc';
import printer from '../utils/printer';

import Enum from 'easy-enums';
import DataStore from '../plumbing/DataStore';

const str = printer.str;

// class ErrorBoundary extends React.Component {
// https://reactjs.org/docs/error-boundaries.html

/**
 * Column definitions:
 * Can be just a string!
 * Object format (all properties are optional)
 * {
 * 	accessor: string|function
 * 	Cell: function: value -> jsx
 * 	Header: string
 * 	editable: boolean
* 		saveFn: ({item,...}) -> {}
 * 	sortMethod: function
 * 	sortAccessor: function
 * 	type: Used for providing an editor - see Misc.PropControl* 	
 * }
 */

/**
 * 
 * dataObject a {key: value} object, which will be converted into rows [{key:k1, value:v1}, {}...]
 * So the columns should use accessors 'key' and 'value'
 * 
 * columns: {Column[]}
 */
class SimpleTable extends React.Component {

	constructor(props) {
		super(props);
	}

	componentWillMount() {
		this.setState({		
		});
	}

	render() {
		let {tableName='SimpleTable', data, dataObject, columns, headerRender, className, csv, addTotalRow} = this.props;		
		assert(_.isArray(columns), "SimpleTable.jsx - columns", columns);
		if (dataObject) {
			// flatten an object into rows
			assert( ! data, "SimpleTable.jsx - data or dataObject - not both");
			data = Object.keys(dataObject).map(k => { return {key:k, value:dataObject[k]}; });
		}
		assert( ! data || _.isArray(data), "SimpleTable.jsx - data must be an array of objects", data);

		let tableSettings = this.state; // DataStore.getValue('widget', tableName);
		if ( ! tableSettings) {
			tableSettings = {};
			DataStore.setValue(['widget', tableName], tableSettings, false);
		}
		if (tableSettings.sortBy !== undefined) {
			// TODO pluck the right column
			let column = columns[tableSettings.sortBy];
			// sort fn
			let sortFn = column.sortMethod;
			if ( ! sortFn) {
				let getter = column.sortAccessor;
				if ( ! getter) getter = a => getValue({item:a, column:column});
				sortFn = (a,b) => defaultSortMethodForGetter(a,b,getter);
			}
			// sort!
			data = data.sort(sortFn);
			if (tableSettings.sortByReverse) {
				data = data.reverse();
			}
		} // sort
		let cn = 'table'+(className? ' '+className : '');

		// HACK build up an array view of the table
		// TODO refactor to build this first, then generate the html
		let dataArray = [[]];

		return (
			<div className={className}>
				<table className={cn}>
					<thead>
						<tr>{columns.map((col, c) => 
							<Th table={this} tableSettings={tableSettings} key={c} column={col} c={c} dataArray={dataArray} headerRender={headerRender} />)}
						</tr>
						{addTotalRow? 
							<tr>
								<th>Total</th>
								{columns.slice(1).map((col, c) => 
									<TotalCell data={data} table={this} tableSettings={tableSettings} key={c} column={col} c={c} />)
								}
							</tr>
							: null}
					</thead>
					<tbody>					
						{data? data.map( (d,i) => <Row key={"r"+i} item={d} row={i} columns={columns} dataArray={dataArray} />) : null}
					</tbody>
					{csv? <tfoot><tr>
						<td colSpan={columns.length}><div className='pull-right'><CSVDownload tableName={tableName} dataArray={dataArray} /></div></td>
					</tr></tfoot>
						: null}	
				</table>				
			</div>
		);
	}
} // ./SimpleTable

// TODO onClick={} sortBy
const Th = ({column, c, table, tableSettings, dataArray, headerRender}) => {
	assert(column, "SimpleTable.jsx - Th - no column?!");
	let sortByMe = (""+tableSettings.sortBy) === (""+c);
	let onClick = e => { 
		console.warn('sort click', c, sortByMe, tableSettings);
		if (sortByMe) {
			table.setState({sortByReverse: ! tableSettings.sortByReverse});
			// tableSettings.sortByReverse = ! tableSettings.sortByReverse;
		} else {
			// table.setState({sortBy: c});
			table.setState({sortByReverse: false});
			// tableSettings.sortByReverse = false;
		}
		table.setState({sortBy: c});
		// tableSettings.sortBy = c;
	};
	let hText;
	if (headerRender) hText = headerRender(column);
	else hText = column.Header || column.accessor || str(column);
	dataArray[0].push(column.Header || column.accessor || str(column)); // csv gets the text, never jsx!
	return (<th onClick={onClick} >
		{hText}
		{sortByMe? <Misc.Icon glyph={'triangle-'+(tableSettings.sortByReverse? 'top' :'bottom')} /> : null}
	</th>);
};

const Row = ({item, row, columns, dataArray}) => {
	let dataRow = [];
	dataArray.push(dataRow);

	return (<tr>
		{columns.map(col => <Cell key={JSON.stringify(col)} row={row} column={col} item={item} dataRow={dataRow} />)}
	</tr>);
};

const getValue = ({item, row, column}) => {
	if ( ! item) {
		console.error("SimpleTable.jsx getValue: null item", column);
		return undefined;
	}
	let accessor = column.accessor || column; 
	let v = _.isFunction(accessor)? accessor(item) : item[accessor];
	return v;
};

/**
 * A default sort
 * NOTE: this must have the column object passed in
 * @param {*} a 
 * @param {*} b 
 * @param {Column} column 
 */
const defaultSortMethodForGetter = (a, b, getter) => {
	assert(_.isFunction(getter), "SimpleTable.jsx defaultSortMethodForGetter", getter);
	// let ia = {item:a, column:column};
	let av = getter(a);
	let bv = getter(b);
	// // avoid undefined 'cos it messes up ordering
	if (av === undefined || av === null) av = "";
	if (bv === undefined || bv === null) bv = "";
	// case insensitive
	if (_.isString(av)) av = av.toLowerCase();
	if (_.isString(bv)) bv = bv.toLowerCase();
	// console.log("sortFn", av, bv, a, b);
	return (av < bv) ? -1 : (av > bv) ? 1 : 0;
};

const defaultCellRender = (v, column) => {
	if (v===undefined || Number.isNaN(v)) return null;
	if (column.format) {
		if (CellFormat.ispercent(column.format)) {
			// 2 sig figs
			return printer.prettyNumber(100*v, 2)+"%";
			}
		}
	if (_.isNumber(v)) {
		// 1 decimal place
		v = Math.round(v*10)/10;
		// commas
		v = printer.prettyNumber(v, 10);
	}
	return str(v);
};
const Cell = ({item, row, column, dataRow}) => {
	try {
		const v = getValue({item, row, column});
		let render = column.Cell;
		if ( ! render) {
			if (column.editable) {
				render = val => <Editor value={val} row={row} column={column} item={item} />;
			} else {
				render = defaultCellRender;
			}
		}

		// HACK for the csv
		dataRow.push(defaultCellRender(v, column)); // TODO use custom render - but what about html/jsx?

		return <td>{render(v, column)}</td>;
	} catch(err) {
		// be robust
		console.error(err);
		return <td>{str(err)}</td>;
	}
};

const TotalCell = ({data, column}) => {
	// sum the data for this column
	let total = 0;
	data.forEach((rItem, row) => {
		const v = getValue({item:rItem, row, column});
		if (_.isNumber(v)) total += v;
	});
	return <td>{defaultCellRender(total, column)}</td>;
};
const Editor = ({row, column, value, item}) => {
	let path = column.path || DataStore.getPath(item);
	let prop = column.prop || (_.isString(column.accessor) && column.accessor);
	let dummyItem;
	if (path && prop) {
		// use item direct
		dummyItem = item || {};
	} else {
		// fallback to dummies
		if ( ! path) path = ['widget', 'SimpleTable', row, str(column)];
		if ( ! prop) prop = 'value';
		dummyItem = {};
		let editedValue = DataStore.getValue(path.concat(prop));
		if (editedValue===undefined || editedValue===null) editedValue = value;
		dummyItem[prop] = editedValue;
	}

	let type = column.type;
	return (<Misc.PropControl type={type} item={dummyItem} path={path} prop={prop} 
		saveFn={column.saveFn} 
	/>);
};
const CellFormat = new Enum("percent"); // What does a spreadsheet normally offer??

const CSVDownload = ({tableName, columns, data, dataArray}) => {
	// assert(_.isArray(jsonArray), jsonArray);
	// // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs
	let csv = dataArray.map(r => r.join? r.map(cell => csvEscCell(cell)).join(",") : ""+r).join("\r\n");
	let csvLink = 'data:text/csv;charset=utf-8,'+csv;
	return (
		<a href={csvLink} download={(tableName||'table')+'.csv'} >
			<Misc.Icon glyph='download-alt' /> .csv
		</a>
	);
};

const csvEscCell = s => {
	if ( ! s) return "";
	assMatch(s, String, "SimpleTable.jsx - csvEscCell not a String "+str(s));
	// do we have to quote?
	if (s.indexOf('"')===-1 && s.indexOf(',')===-1 && s.indexOf('\r')===-1 && s.indexOf('\n')===-1) {
		return s;
	}
	// quote to double quote
	s = s.replace(/"/g, '""');
	// quote it
	return '"'+s+'"';
};

export default SimpleTable;
export {CellFormat};
