function init() {
	var s = document.createElement('script');
	s.src = 'Slate.js';
	s.onload = startSlate;
	document.head.appendChild(s);
}

function startSlate() {
	var s = new Slate('canvas');
	window.s = s;
}

