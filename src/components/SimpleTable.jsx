/*
	Copying a little bit of react-table
	Because react-table was causing my system to crash.
	See https://github.com/react-tools/react-table#example
*/

import React from 'react';
import ReactDOM from 'react-dom';

// import SJTest, {assert, assMatch} from 'sjtest';
import _ from 'lodash';
import Misc from './Misc';
import printer from '../utils/printer';

import DataStore from '../plumbing/DataStore';

const str = printer.str;

// class ErrorBoundary extends React.Component {
// https://reactjs.org/docs/error-boundaries.html

class SimpleTable extends React.Component {

	constructor(props) {
		super(props);
	}

	componentWillMount() {
		this.setState({		
		});
	}

	render() {
		let {tableName='SimpleTable', data, columns, className} = this.props;
		assert(_.isArray(columns), "SimpleTable.jsx - columns", columns);
		assert( ! data || _.isArray(data), "SimpleTable.jsx - data must be an array of objects", data);

		let tableSettings = this.state; // DataStore.getValue('widget', tableName);
		if ( ! tableSettings) {
			tableSettings = {};
			DataStore.setValue(['widget', tableName], tableSettings, false);
		}
		if (tableSettings.sortBy !== undefined) {
			// TODO pluck the right column
			let column = columns[tableSettings.sortBy];
			let sortFn = (a,b) => {
				let av = getValue({item:a, column});
				let bv = getValue({item:b, column});
				return av < bv;
			};
			data = data.sort(sortFn);
			if (tableSettings.sortByReverse) {
				data = data.reverse();
			}
		} // sort
		let cn = 'table'+(className? ' '+className : '');

		return (
			<table className={cn}>
				<tbody>
					<tr>{columns.map((col, c) => <Th table={this} tableSettings={tableSettings} key={JSON.stringify(col)} column={col} c={c} />)}</tr>
					{data? data.map( (d,i) => <Row key={"r"+i} item={d} row={i} columns={columns} />) : null}
				</tbody>
			</table>
		);
	}
} // ./SimpleTable

// TODO onClick={} sortBy
const Th = ({column, c, table, tableSettings}) => {
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
	return (<th onClick={onClick} >
		{ column.Header || column.name || column.id || str(column)}
		{sortByMe? <Misc.Icon glyph={'triangle-'+(tableSettings.sortByReverse? 'top' :'bottom')} /> : null}
	</th>);
};

const Row = ({item, row, columns}) => {
	return (<tr>
		{columns.map(col => <Cell key={JSON.stringify(col)} row={row} column={col} item={item} />)}
	</tr>);
};

const getValue = ({item, row, column}) => {
	let accessor = column.accessor || column; 
	let v = _.isFunction(accessor)? accessor(item) : item[accessor];
	return v;
};

const Cell = ({item, row, column}) => {
	try {
		const v = getValue({item, row, column});
		let render = column.Cell;
		if ( ! render) {
			if (column.editable) {
				render = val => <Editor value={val} row={row} column={column} item={item} />;
			} else {
				render = val => str(val);
			}
		}
		return <td>{render(v)}</td>;
	} catch(err) {
		// be robust
		console.error(err);
		return <td>{str(err)}</td>;
	}
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

export default SimpleTable;
