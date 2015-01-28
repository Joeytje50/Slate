function Slate(id) {
	this.s = { //defaults
		color1: '#000',
		color2: '#FFF',
		alpha1: 1,
		alpha2: 1,
		size: 4,
		tool: 'pen',
		eraser: false,
		fill: true,
		FPS: 30,
	};
	//read default values for the settings; use hidden inputs for default values.
	var target, val;
	for (var it in this.s) {
		target = document.getElementsByName('Slate-'+it);
		if (target.length < 1)
			continue;
		val = typeof this.s[it] === 'number' ? +target[0].value : target[0].value;
		if (target.length === 1)
			this.s[it] = val || this.s[it];
		else //multiple inputs - radio buttons
			for (var i=0;i<target.length;i++)
				if (target[i].checked)
					this.s[it] = target[i].value;
	}
	this.container = document.getElementById(id);
	//TODO: make default values for settings
	//More structured: keep the initialising of elements seperate from the rest of the constructor
	(function initElements(self) {
		//create canvas
		var c = document.createElement('canvas');
		c.id = "slate";
		c.setAttribute('style', 'width: 100%; height: 100%'); //temp; to set the correct size
		self.container.appendChild(c);
		self.width = c.clientWidth;
		self.height = c.clientHeight;
		c.setAttribute('width', self.width);
		c.setAttribute('height', self.height);
		c.removeAttribute('style');
		self.canvas = self.c = c;
		self.ctx = self.c.getContext('2d');
		//create working svg, for manipulating something as a vector graphic before inserting it into the bitmap canvas
		var div = document.createElement('div'); //this is to be able to retrieve the SVG's outerHTML ( = the div's innerHTML)
		var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.id = "svg";
		svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		div.appendChild(svg);
		self.container.appendChild(div);
		svg.setAttribute('width', c.clientWidth); //same width and height as canvas
		svg.setAttribute('height', c.clientHeight);
		self.svg = svg;
	})(this);
	//Event handlers
	this.e = { //main Event object, for storing event data
		mousedown: false,
		shiftKey: false,
		target: null,
		prevX: 0,
		prevY: 0,
		posX: 0,
		posY: 0,
		prevT: 0, //previous time
		moveOut: false, //keep track of moving out of the svg
		resizeDir: 0, //direction of resizing: none (0), diagonal (1), horizontal (2), or vertical (3)
		coords: {x1: 0, y1: 0, x2: 0, y2: 0},
	};
	this.curShape = null;
	this.cursor = null;
	this.bmp = this.ctx.getImageData(0, 0, this.width, this.height);
	this.UI = null;
	//initialise everything:
	this.initEvents();
	this.createUI();
	this.changeCursor();
}

/*TODO:
 * change ctrl+s, ctrl+v, ctrl+c, etc. copy/paste: use extra <img> tag
 * hijack other shortcuts
 * selection: stroke-dasharray
 * more text edit features (just some basic ones)
 * dynamic canvas size
 * middlemouse click menu
 * perhaps a LaTeX maker within $ $? (after everything else's implemented)
 * Is the scroll to change pen size useful or just annoying?
*/

/****** General methods ******/
SVGElement.prototype.contains = HTMLElement.prototype.contains; //IE doesn't support svg.contains

Slate.prototype.hexToRgba = function(hex, alpha) {
	hex = hex.replace('#', ''); //remove the # from the start
	var r = parseInt(hex.substring(0,2), 16),
		g = parseInt(hex.substring(2,4), 16),
		b = parseInt(hex.substring(4,6), 16);
	return 'rgba('+r+','+g+','+b+','+alpha+')';
}

Slate.prototype.rgbToHex = function(r, g, b) {
	r = this.pad0(r.toString(16));
	g = this.pad0(g.toString(16));
	b = this.pad0(b.toString(16));
	return '#'+r+g+b;
}

Slate.prototype.pad0 = function(n, len) {
	n += '';
	len = len || 2;
	var length = n.length
	if (length < len)
		return Array(len-length + 1).join('0') + n;
	else
		return n;
}

Slate.prototype.getCurPos = function(e) {
	return [e.pageX - 1, e.pageY - 1]; //TODO: get the absolute position of the svg on the page
}

//Function that determines the width and height of a shape when shift is held down.
//in the case of a line, w and h can be 0.
Slate.prototype.shiftWh = function(s, isLine) {
	var w = s.x2 - s.x1,
		h = s.y2 - s.y1;
	var absW = Math.abs(w),
		absH = Math.abs(h);
	//store the +- sign of both W and H to determine the direction later
	var signW = w < 0 ? -1 : 1,
		signH = h < 0 ? -1 : 1;
	//the size of both width and height is determined by the smallest of the two
	var size = Math.min(absW, absH);
	//only lines can be something other than w === +- h (namely w==0 or h==0)
	if (isLine && absW >= 2*absH) { //closer to horizontal than diagonal
		s.y2 = s.y1; //height is now 0
	} else if (isLine && absH >= 2*absW) { //closer to vertical than diagonal
		s.x2 = s.x1; //width is now 0
	} else {
		//the +- sign is preserved, but the smallest size is used for both.
		s.x2 = s.x1 + signW * size; //origin +- size
		s.y2 = s.y1 + signH * size; //origin +- size
	}
}

Slate.prototype.initEvents = function() {
	var list = [
		'mousedown',
		'mousemove',
		'mouseup',
		'contextmenu',
		'change',
		'input', //same as onpropertychange for old IE
		'mousewheel',
		'DOMMouseScroll',
	];
	for (var i=0;i<list.length;i++) {
		document.addEventListener(list[i], this[list[i]].bind(this));
	}
}

Slate.prototype.set = function(setting, value) {
	this.s[setting] = value;
}
Slate.prototype.setAttrs = function(el, attrs) {
	if (!el)
		return console.error('ReferenceError: %cel%c is not defined', 'font-style: italic;', 'font-style: normal;');
	for (var attr in attrs)
		if (attrs[attr] !== null)
			el.setAttribute(attr, attrs[attr]);
}
Slate.prototype.ucFirst = function(str) {
	return str.charAt(0).toUpperCase() + str.substr(1);
}
Slate.prototype.newShape = document.createElementNS.bind(document, 'http://www.w3.org/2000/svg');
Slate.prototype.prependChild = function(el, to) {
	if (to.firstChild)
		to.insertBefore(el, to.firstChild);
	else
		to.appendChild(el);
}

//See https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Drawing_DOM_objects_into_a_canvas
Slate.prototype.insertSvg = function(callback) { //TODO: ctrl+z
	if (this.svg.childElementCount === 0) { //don't bother if it's empty.
		if (callback) callback.call(this);
		return;
	}
	var txtedit = document.getElementById('Slate-texteditor');
	if (this.UI) {
		this.UI.parentNode.removeChild(this.UI);
		this.UI = null;
	}
	this.e.resizeDir = 0;
	var self = this;
	var DOMURL = window.URL || window.webkitURL || window;
	var data = this.svg.parentNode.innerHTML.replace(/<br>/g, '<br/>');
	var img = new Image();
	if (txtedit) {
		var url = 'data:image/svg+xml;base64,' + btoa(data);
	} else {
		var svg = new Blob([data], {type: 'image/svg+xml;charset=utf-8'});
		var url = DOMURL.createObjectURL(svg);
	}
	img.onload = function() {
		self.c.getContext('2d').drawImage(img, 0, 0);
		DOMURL.revokeObjectURL(url);
		while (self.svg.firstChild)
			self.svg.removeChild(self.svg.firstChild);
		self.createUI();
		if (callback) callback.call(self);
	}
	img.src = url;
}

Slate.prototype.setProperties = function(el, shape) {
	var color, fill;
	if (shape === 'text') {
		var color = this.hexToRgba(this.s.color1, this.s.alpha1);
		var fill = this.hexToRgba(this.s.color2, this.s.alpha2);
		this.setAttrs(el && el.childNodes[0], {
			id: 'Slate-texteditor',
			style: (
				'padding: 5px;'+
				'width: 100%;'+
				'height: 100%;'+
				'box-sizing: border-box;'+ //keeps the border inside the limits
				'color: '+color+';'+
				'font-size: '+(this.s.size * 4)+'px;'+
				'font-family: "Times New Roman";'+
				(this.s.fill ?
					'text-shadow: '+fill+' 0 0 1px, '+fill+' 0 0 1px, '+
									fill+' 0 0 2px, '+fill+' 0 0 2px, '+
									fill+' 0 0 3px, '+fill+' 0 0 3px;'
				: '')
			),
		});
	} else {
		if (this.s.fill && shape.slice(-4) !== 'line') {
			fill = this.hexToRgba(this.s.color2, this.s.alpha2);
		} else {
			fill = 'none';
		}
		//then set the attributes
		this.setAttrs(el, {
			'stroke-width': this.s.size,
			stroke: this.hexToRgba(this.s.color1, this.s.alpha1),
			fill: fill,
			id: 'curShape',
		});
	}
	this.curShape = el;
}

Slate.prototype.pipette = function(x, y) {
	var pixel = this.ctx.getImageData(x,y,1,1).data;
	var inputnum = this.e.shiftKey + 1; //true + 1 === 2;
	var input = document.getElementsByName('Slate-color'+inputnum)[0];
	input.value = this.rgbToHex(pixel[0], pixel[1], pixel[2]);
	this.change({target: input});
}

//Based on http://www.williammalone.com/articles/html5-canvas-javascript-paint-bucket-tool/ with minor improvements
Slate.prototype.floodfill = function(x, y) {
	var stack = [[x,y]];
	var width = this.width, width4 = width * 4, height = this.height;
	var data = this.ctx.getImageData(0, 0, width, height);
	var hexcolor = (this.e.shiftKey ? this.s.color2 : this.s.color1).replace('#','');
	var toCol = [];
	toCol.push(parseInt(hexcolor.substring(0,2), 16)); //R
	toCol.push(parseInt(hexcolor.substring(2,4), 16)); //G
	toCol.push(parseInt(hexcolor.substring(4,6), 16)); //B
	toCol.push(parseInt(this.e.shiftKey ? this.s.alpha2 : this.s.alpha1) * 255);
	var startPx = width4*y + 4*x;
	var fromCol = [data.data[startPx], data.data[startPx+1], data.data[startPx+2], data.data[startPx+3]];
	function checkColor(px) {
		var d = data.data;
		return fromCol[0] === d[px] && fromCol[1] === d[px+1] && fromCol[2] === d[px+2] && fromCol[3] === d[px+3];
	}
	function checkEdge(px) {
		var d = data.data;
	}
	function addColor(px) {
		data.data[px] = toCol[0];
		data.data[px+1] = toCol[1];
		data.data[px+2] = toCol[2];
		data.data[px+3] = toCol[3]; //canvas shouldn't have opacity, this is not possible here
	}
	if (toCol[0] === data.data[startPx] && toCol[1] === data.data[startPx+1] && toCol[2] === data.data[startPx+2] && toCol[3] === data.data[startPx+3])
		return; //the pixel is already the desired color.
	//The actual algorithm
	var xy, px, yWidth, left, right;
	while (stack.length) {
//var t = setInterval((function() {
		xy = stack.pop();
		x = xy[0];
		y = xy[1];
		px = width4 * y + 4*x;
		//move to the top first, so we can scan the whole line in one go
		while (y > 0 && checkColor(px - width4)) { 
			--y;
			px -= width4;
		}
		left = false; //keep track of sequences of fillable pixels to the sides
		right = false;
		while (y < height && checkColor(px)) { //also allow slight opacity changes in the check
			if (x > 0) {
				if (checkColor(px - 4)) {
					if (!left) {
						stack.push([x-1, y]);
						left = true;
					}
				} else {
					left = false;
				}
			}
			if (x < width - 1) {
				if (checkColor(px + 4)) {
					if (!right) {
						stack.push([x+1, y]);
						right = true;
					}
				} else {
					right = false;
				}
			}
			addColor(px);
			++y;
			px += width4;
		}
//this.ctx.putImageData(data, 0, 0);
	}
//).bind(this), 1);
	this.ctx.putImageData(data, 0, 0);
}

/****** Methods for creating shapes ******/

/*
 * @param string type The type of shape to create, like rect, oval, text, line, polyline, ...
 * @param obj s The configurations of the shape, containing the relevant info:
 	x: x coordinate, y: y coordinate, w: width, h: height
 	If type is /(poly)?line/ w and h represent the end-x and end-y coordinate.
 */
Slate.prototype.createShape = function(type, s) {
	if (type === 'pen') type = 'polyline';
	var uppercase = this.ucFirst(type);
	if ('create'+uppercase in this) {
		this['create'+uppercase](s.x, s.y);
	}
}

//TODO: Make this more customisable
Slate.prototype.createText = function(x, y) {
	var foreign = this.newShape('foreignObject');
	this.setAttrs(foreign, {
		x: x,
		y: y,
		width: 0,
		height: 0,
	});
	var div = document.createElement('div');
	var shade = this.s.color2;
	this.setAttrs(div,{
		xmlns: 'http://www.w3.org/1999/xhtml',
		contenteditable: true,
	});
	foreign.appendChild(div);
	this.setProperties(foreign, 'text');
	this.prependChild(foreign, this.svg);
	div.focus();
}

Slate.prototype.createRect = function(x, y, w, h) {
	var rect = this.newShape('rect');
	this.setAttrs(rect, {
		x: x,
		y: y,
		width: 0,
		height: 0,
	});
	this.setProperties(rect, 'rect');
	this.prependChild(rect, this.svg);
}

Slate.prototype.createLine = function(x, y, w, h) {
	var line = this.newShape('line');
	this.setAttrs(line, {
		x1: x,
		y1: y,
		x2: x,
		y2: y,
	});
	this.setProperties(line, 'line');
	this.prependChild(line, this.svg);
}

Slate.prototype.createPolyline = function(x, y) {
	var ctx = this.ctx;
	ctx.beginPath();
	if (this.e.shiftKey || this.s.eraser) {
		ctx.strokeStyle = this.hexToRgba(this.s.color2, this.s.alpha2);
	} else {
		ctx.strokeStyle = this.hexToRgba(this.s.color1, this.s.alpha1)
	}
	ctx.fillStyle = ctx.strokeStyle; //copy from the above if-statement.
	if (this.s.eraser) {
		ctx.globalCompositeOperation = "destination-out";
	} else {
		ctx.globalCompositeOperation = "source-over";
	}
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.lineWidth = this.s.size + (this.s.eraser ? 8 : 0);
	this.bmp = ctx.getImageData(0,0,this.width, this.height);
	ctx.beginPath(); //start over after creating the dot
	this.ctx.arc(x, y, ctx.lineWidth/2, 0, 2*Math.PI); //create starting dot 
	this.ctx.fill();
	ctx.beginPath(); //if mouse moves, this new beginPath will reset to this.bmp, removing the starting dot (which is good)
	ctx.moveTo(x, y);
}

Slate.prototype.createOval = function(x, y) {
	var oval = this.newShape('ellipse');
	this.setAttrs(oval, {
		cx: x,
		cy: y,
		rx: 0,
		ry: 0,
	});
	this.setProperties(oval, 'oval');
	this.prependChild(oval, this.svg);
}

/****** Methods for changing shapes ******/
Slate.prototype.changeShape = function(x1, y1, x2, y2) {
	var coords = {x1: x1, y1: y1, x2: x2, y2: y2};
	if (this.e.resizeDir <= 1 && this.e.shiftKey && this.s.tool !== 'pen') {
		//Change the coordinates to make the shape a square/circle/straight line
		//won't work when resizing in one direction only (horizontal/vertical only resizing)
		this.shiftWh(coords, this.s.tool === 'line');
	}
	var tool;
	switch (this.s.tool) {
		case 'pen': tool = 'Polyline'; break;
		case 'text': tool = 'Rect'; break;
		default: tool = this.ucFirst(this.s.tool); break;
	}
	this['change'+tool](coords.x1, coords.y1, coords.x2, coords.y2);
	if (this.s.tool !== 'pen')
		this.changeSelection(x1, y1, x2, y2);
}

Slate.prototype.changeLine = function(x1, y1, x2, y2) {
	var cur = this.curShape;
	this.setAttrs(cur, {
		x1: x1,
		y1: y1,
		x2: x2,
		y2: y2,
	});
}

Slate.prototype.changeRect = function(x1, y1, x2, y2) {
	var attrs = {};
	var cur = this.curShape;
	if (this.e.resizeDir !== 2) { //don't resize vertically when resizing horizontally
		attrs['y'] = Math.min(y1, y2);
		attrs['height'] = Math.abs(y2 - y1);
	}
	if (this.e.resizeDir !== 3) { //vice versa
		attrs['x'] = Math.min(x1, x2);
		attrs['width'] = Math.abs(x2 - x1);
	}
	this.setAttrs(cur, attrs);
}

Slate.prototype.changeOval = function(x1, y1, x2, y2) {
	var attrs = {};
	var cur = this.curShape;
	if (this.e.resizeDir !== 2) { //don't resize vertically when resizing horizontally
		attrs['cy'] = y1 + (y2-y1)/2;
		attrs['ry'] = Math.abs(y2-y1)/2;
	}
	if (this.e.resizeDir !== 3) { //vice versa
		attrs['cx'] = x1 + (x2-x1)/2;
		attrs['rx'] = Math.abs(x2-x1)/2;
	}
	this.setAttrs(cur, attrs);
}

Slate.prototype.changePolyline = function(x1, y1, x2, y2) {
	var command = this.e.moveOut ? 'moveTo' : 'lineTo';
	var ctx = this.ctx;
	if (this.s.eraser)
		ctx.globalCompositeOperation="destination-out";
	else
		ctx.globalCompositeOperation="source-over";
	if (ctx.lineWidth !== this.s.size + (this.s.eraser ? 8 : 0)) {
		this.bmp = ctx.getImageData(0,0,this.width, this.height);
		ctx.beginPath();
		ctx.lineWidth = this.s.size + (this.s.eraser ? 8 : 0);
		ctx.moveTo(x1, y1);
	}
	ctx[command](x2, y2);
	ctx.putImageData(this.bmp, 0, 0);
	ctx.stroke();
	//store current location as the next previous one; ONLY for pen.
	this.e.prevX = x2;
	this.e.prevY = y2;
	this.e.moveOut = false;
}

/****** User Interface ******/
Slate.prototype.createUI = function() {
	this.UI = this.newShape('g');
	this.setAttrs(this.UI, {
		id: 'Slate-UI',
	});
	var cursor = this.newShape('circle');
	this.setAttrs(cursor, {
		id: 'Slate-cursor',
		cx: 0,
		cy: 0,
		r: 0,
		'stroke-dasharray': '3,3',
		'stroke-width': 1,
	});
	this.cursor = cursor;
	this.UI.appendChild(cursor);
	this.svg.appendChild(this.UI);
}

Slate.prototype.moveCursor = function(x, y) {
	var cur = this.svg.getElementById('Slate-cursor');
	if (!cur || this.s.tool !== 'pen') return;
	this.setAttrs(cur, {
		cx: x,
		cy: y,
		r: (this.s.size + (this.s.eraser ? 8 : 0)) / 2,
		stroke: this.s.eraser ? 'black' : 'none',
		fill: this.s.eraser ? 'none' : this.s.color1,
	});
}

Slate.prototype.changeCursor = function() {
	if (this.s.tool === 'rect' || this.s.tool === 'oval' || this.s.tool === 'line') {
		this.container.style.cursor = 'crosshair';
	} else {
		var cur = this.s.tool + '.cur';
		if (this.s.tool === 'pen' && this.s.eraser)
			cur = 'eraser.cur';
		this.container.style.cursor = 'url(icons/'+cur+'), default';
	}
}

//http://stackoverflow.com/q/27673416/1256925
Slate.prototype.createFilter = function() {
	var filter = this.newShape('filter');
	this.setAttrs(filter, {
		id: 'fillBlack',
		x: '-200%',
		y: '-200%',
		width: '500%',
		height: '500%',
		primitiveUnits: 'objectBoundingBox',
	});
	var mtrx = this.newShape('feFlood');
	this.setAttrs(mtrx, {
		'flood-color': 'black',
		result: 'blackBox',
		x: '-20%',
		y: '-20%',
		width: '140%',
		height: '140%',
	});
	filter.appendChild(mtrx);
	var comp = this.newShape('feComposite');
	this.setAttrs(comp, {
		operator: 'over',
		'in': 'SourceGraphic',
		in2: 'blackBox',
	});
	filter.appendChild(comp);
	this.UI.appendChild(filter);
}

Slate.prototype.startSelection = function(isLine) {
	var cursors, i;
	var container = this.newShape('g');
	this.setAttrs(container, {
		id: 'Slate-selection',
	});
	this.createFilter();
	var g = this.newShape('g');
	this.setAttrs(g, {
		fill: 'white',
		stroke: 'transparent',
		'stroke-width': 20,
		'pointer-events': 'all',
		transform: 'translate(-2, -2)',
		id: 'Slate-selection-boxes',
	});
	if (isLine) {
		cursors = ['ns', 'ns'];
	} else {
		for (i=0;i<2;i++) {
			var outline = this.newShape('rect');
			this.setAttrs(outline, {
				x: 3,
				y: 3,
				width: 0,
				height: 0,
				fill: 'none',
				stroke: ['black', 'white'][i], //first is black, second is white
				'stroke-dasharray': '6,6',
				'stroke-dashoffset': i ? 6 : null, //first has offset 0, second has offset 6
				'stroke-width': 1,
				id: 'Slate-selection-outline-'+(i+1),
			});
			container.appendChild(outline);
		}
		cursors = ['nw', 'n', 'ne', 'w', '', 'e', 'sw', 's', 'se']; //the direction the cursors should indicate resizing
	}
	var corner;
	for (i=0;i<cursors.length;i++) {
		corner = this.newShape('rect');
		if (i==4) {//don't make a dot right in the middle
			this.setAttrs(corner, {x: 0, y: 0, width: 0, height: 0, fill: 'none', stroke: 'none'});
		} else {
			this.setAttrs(corner, {
				x: 0,
				y: 0,
				width: 5, // width and height can't be replaced with these attributes on <g>.
				height: 5,
				filter: 'url(#fillBlack)',
				style: 'cursor: '+cursors[i]+'-resize',
				desc: cursors[i],
			});
		}
		g.appendChild(corner);
	}
	container.appendChild(g);
	this.UI.appendChild(container);
}

Slate.prototype.changeSelection = function(x1, y1, x2, y2) {
	var sel = this.svg.getElementById('Slate-selection');
	var outline1 = this.svg.getElementById('Slate-selection-outline-1');
	var outline2 = this.svg.getElementById('Slate-selection-outline-2');
	if (!sel) return; //the selection boxes haven't been made yet; stop trying
	var box = this.svg.getElementById('Slate-selection-boxes');
	var boxes = box.childNodes;
	//This object will be used to run shiftWh on, and it stores those values after the
	// other variables have been sorted via Math.max and Math.min.
	var coords = {x1: x1, y1: y1, x2: x2, y2: y2};
	if (this.e.resizeDir <= 1 && this.e.shiftKey && this.s.tool !== 'pen') {
		//Change the coordinates to make the shape a square/circle/straight line
		//won't work when resizing in one direction only (horizontal/vertical only resizing)
		this.shiftWh(coords, this.s.tool === 'line');
	}
	//make sure x and y coordinates are in increasing order (top-left -> bottom-right)
	if (boxes.length === 2) { //for lines
		x1 = coords.x1;
		y1 = coords.y1;
		x2 = coords.x2;
		y2 = coords.y2;
		this.setAttrs(box, {
			desc: x1+','+y1+','+x2+','+y2,
		});
		this.setAttrs(boxes[0], {
			x: x1,
			y: y1,
		});
		this.setAttrs(boxes[1], {
			x: x2, //this needs the original coordinates
			y: y2,
		});
	} else {
		x1 = Math.min(coords.x1, coords.x2);
		y1 = Math.min(coords.y1, coords.y2);
		x2 = Math.max(coords.x1, coords.x2);
		y2 = Math.max(coords.y1, coords.y2);
		var original = (box.getAttribute('desc')||'0,0,0,0').split(','); //defaults to 0,0,0,0
		if (this.e.resizeDir === 2) { //horizontal-only resizing; y stays the same
			y1 = +original[1]; //convert to number first
			y2 = +original[3];
		} else if (this.e.resizeDir === 3) { //vertical-only resizing; x stays the same
			x1 = +original[0];
			x2 = +original[2];
		}
		this.setAttrs(box, {
			transform: 'translate('+(x1-2)+', '+(y1-2)+')',
			desc: x1+','+y1+','+x2+','+y2,
		});
		//since x and y coords are already in increasing order, no Math.min stuff is needed:
		var outlineCoords = {
			x: x1+0.5,
			y: y1+0.5,
			width: x2 - x1,
			height: y2 - y1,
		};
		this.setAttrs(outline1, outlineCoords);
		this.setAttrs(outline2, outlineCoords);
		for (var i=0; i<boxes.length; i++) {
			this.setAttrs(boxes[i], {
				x: ((i % 3) * (x2-x1)/2) |0, // |0 is trunc
				y: (Math.floor(i / 3) * (y2-y1)/2) |0,
			});
		}
	}
}

/****** Event handler functions ******/

//This is not an actual event handler. it only functions as one, and is called from within .mousedown
Slate.prototype.middlemouseclick = function(e) {
	//TODO: epic menu
}

//Mousedown doesn't do anything but save the location. Only when mouse releases or moves something appears.
Slate.prototype.mousedown = function(e) {
	if (e.which === 2) { //middle mouse click
		this.middlemouseclick(e);
		return;
	}
	var sel = this.svg.getElementById('Slate-selection-boxes');
	if (sel && sel.contains(e.target)) { //true if e.target is a resizing box
		e.preventDefault();
		this.e.shiftKey = e.shiftKey;
		this.e.moveOut = false;
		this.e.mousedown = true;
		var cursors = ['nw', 'n', 'ne', 'w', '', 'e', 'sw', 's', 'se'];
		var type = e.target.getAttribute('desc'); //returns the resizing direction.
		var pos = cursors.indexOf(type);
		var g = e.target.parentNode;
		switch (type) {
			case 'e': case 'w': this.e.resizeDir = 2; break;
			case 'n': case 's': this.e.resizeDir = 3; break;
			default: this.e.resizeDir = 1; break;
		}
		var coords = e.target.parentNode.getAttribute('desc').split(',');
		if (pos % 3 === 0 || (g.childElementCount === 2 && e.target === g.firstChild)) { 
			//the box is in the first column, or it's the first box for lines
			this.e.prevX = +coords[2];
		} else {
			this.e.prevX = +coords[0];
		}
		if (pos < 3 && (g.childElementCount !== 2 || e.target === g.firstChild)) {
			//the box is in the first row, or it's the first box for lines
			this.e.prevY = +coords[3];
		} else {
			this.e.prevY = +coords[1];
		}
	} else if ((e.target === this.svg || this.svg.contains(e.target)) && e.target.tagName.toLowerCase() !== 'div') {
		this.e.posX = e.offsetX || e.layerX; //offsetX is W3C standard, layerX is for FF
		this.e.posY = e.offsetY || e.layerY;
		e.preventDefault(); //contextmenu, scroll popup thingy
		this.e.moveOut = false;
		this.e.shiftKey = e.shiftKey;
		if ((this.s.tool === 'pen' || this.s.tool === 'fill') && e.which === 3) {
			this.e.shiftKey = true; //right mouse works just like shift key (eraser) for pen
			//only for pen; eraser stays eraser with right mouse button.
		} else if (e.which === 3) {
			this.s.fill = !this.s.fill; //swap fill setting when using right mouse button
		}
		if (this.s.tool === 'pipette' || (this.s.tool === 'pen' && e.ctrlKey)) {
			this.pipette(this.e.posX, this.e.posY); //with tool === pen||pipette, the svg is always empty.
			return;
		} else if (this.s.tool === 'fill') {
			this.floodfill(this.e.posX, this.e.posY);
		}
		this.insertSvg(function() {
			this.createShape(this.s.tool, {
				x: this.e.posX,
				y: this.e.posY,
			});
			if (this.s.tool === 'pen')
				this.moveCursor(this.e.posX, this.e.posY);
			this.e.prevX = this.e.posX;
			this.e.prevY = this.e.posY;
			this.e.prevT = e.timeStamp;
			this.e.mousedown = true; //change inside callback so mousemoves don't work while loading
		});
	} else if (e.target.type === 'range' && e.detail > 1) { //multi-click on a range input resets them
		e.target.value = e.target.getAttribute('value'); //reset to original attribute value (its default)
		this.change(e);
	}
}

Slate.prototype.mousemove = function(e) {
	var cur = this.svg.getElementById('Slate-cursor');
	if (e.target !== this.svg && !this.svg.contains(e.target)) { //stop if the mouse is outside the svg
		this.e.moveOut = true;
		if (cur)
			cur.style.display = 'none'; //hide the cursor dot when outside the canvas
		return;
	} else {
		if (cur)
			cur.style.display = this.s.tool === 'pen' ? 'initial' : 'none'; //only show for 'pen'
	}
	var posX = e.layerX || e.offsetX; //offsetX is W3C standard, layerX is often more accurate
	var posY = e.layerY || e.offsetY;
	this.moveCursor(posX, posY)
	//only register actual movements, only when mouse is down.
	if (!this.e.mousedown || (this.e.prevX === posX && this.e.prevY === posY)) 
		return;
	var curT = e.timeStamp;
	var moved = Math.abs(this.e.prevX - posX) + Math.abs(this.e.prevY - posY); //absolute total distance moved
	//pen must always move >2px; show at most >FPS< fps; Exception: when pen(!) has travelled more than 10px. 
	if ((this.s.tool === 'pen' && moved < 2) || (curT - this.e.prevT < ((1000/this.s.FPS)) && !(this.s.tool === 'pen' && moved > 10))) {
		return;
	}
	this.e.posX = posX; //copy over to class variable now that the checks has been passed
	this.e.posY = posY;
	this.e.moving = true;
	this.e.shiftKey = e.shiftKey || (this.s.tool === 'pen' && e.which === 3);
	//make a selection box for text boxes, because they don't have outlines of themselves.
	if (this.s.tool === 'text' && this.e.resizeDir === 0) {
		this.startSelection(false);
	}
	//Now we're sure we're mouse-down, on the svg, moving, and either more than 1/FPSth of a second later, OR moving fast with the pen.
	this.changeShape(this.e.prevX,this.e.prevY,this.e.posX,this.e.posY);
	this.e.prevT = curT;
}

Slate.prototype.mouseup = function(e) {
	if (this.e.moving && this.e.resizeDir === 0 && ['rect', 'oval', 'line'].indexOf(this.s.tool) !== -1) {
		this.startSelection(this.s.tool === 'line');
		this.changeSelection(this.e.prevX,this.e.prevY,this.e.posX,this.e.posY);
	}
	this.e.shiftKey = e.shiftKey; //reset in the case of right mouse click
	this.s.fill = document.getElementsByName('Slate-fill')[0].checked;
	this.e.moving = false;
	this.e.mousedown = false;
}

Slate.prototype.contextmenu = function(e) {
	e.preventDefault();
}

Slate.prototype.change = function(e) {
	if (this.s.hasOwnProperty('Slate-'+e.target.name) === -1) return;
	var setting = e.target.name.slice('Slate-'.length);
	if (e.target.type === 'checkbox') {
		this.s[setting] = e.target.checked;
	} else if (e.target.type === 'radio') {
		if (e.target.checked) {
			if (e.target.value === 'gum') {
				this.s.tool = 'pen';
				this.s.eraser = true;
			} else {
				this.s[setting] = e.target.value;
				this.s.eraser = false;
			}
		}
		this.insertSvg(this.changeCursor);
	} else {
		if (typeof this.s[setting] === 'number')
			this.s[setting] = +e.target.value; //keep it a number
		else
			this.s[setting] = e.target.value;
	}
	if (e.target.type !== 'radio' && this.curShape !== null) {
		var shapeType = this.s.tool === 'pen' ? 'polyline' : this.s.tool;
		this.setProperties(this.curShape, shapeType);
	}
}

Slate.prototype.input = function(e) {
	//dynamic updating on range sliding
	if (e.target.type === 'range')
		this.change(e); //send through to the change event handler
}

//TODO: is this helpful or just annoying?
Slate.prototype.mousewheel = 
Slate.prototype.DOMMouseScroll = function(e) {
	e.preventDefault(); //aint nobody scrollin around here
	var dir = e.wheelDelta || -e.detail;
	var target = document.getElementsByName('Slate-size')[0];
	if (dir < 0)
		target.value = target.value / 1.2 - 1;
	else
		target.value = target.value * 1.2 + 1;
	this.change({target: target});
}