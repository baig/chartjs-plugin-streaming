'use strict';

export default function(Chart, moment) {

	var helpers = Chart.helpers;

	helpers.cancelAnimFrame = (function() {
		if (typeof window !== 'undefined') {
			return window.cancelAnimationFrame ||
				window.webkitCancelAnimationFrame ||
				window.mozCancelAnimationFrame ||
				window.oCancelAnimationFrame ||
				window.msCancelAnimationFrame ||
				function(id) {
					return window.clearTimeout(id);
				};
		}
	}());

	var realTimeScaleDefaultConfig = {
		position: 'bottom',
		distribution: 'linear',
		bounds: 'data',

		time: {
			parser: false, // false == a pattern string from http://momentjs.com/docs/#/parsing/string-format/ or a custom callback that converts its argument to a moment
			format: false, // DEPRECATED false == date objects, moment object, callback or a pattern string from http://momentjs.com/docs/#/parsing/string-format/
			unit: false, // false == automatic or override with week, month, year, etc.
			round: false, // none, or override with week, month, year, etc.
			displayFormat: false, // DEPRECATED
			isoWeekday: false, // override week start day - see http://momentjs.com/docs/#/get-set/iso-weekday/
			minUnit: 'millisecond',

			// defaults to unit's corresponding unitFormat below or override using pattern string from http://momentjs.com/docs/#/displaying/format/
			displayFormats: {
				millisecond: 'h:mm:ss.SSS a', // 11:20:01.123 AM,
				second: 'h:mm:ss a', // 11:20:01 AM
				minute: 'h:mm a', // 11:20 AM
				hour: 'hA', // 5PM
				day: 'MMM D', // Sep 4
				week: 'll', // Week 46, or maybe "[W]WW - YYYY" ?
				month: 'MMM YYYY', // Sept 2015
				quarter: '[Q]Q - YYYY', // Q3
				year: 'YYYY' // 2015
			},
		},
		realtime: {},
		ticks: {
			autoSkip: false,
			source: 'auto',
			major: {
				enabled: true
			}
		}
	};

	// Ported from Chart.js 2.7.2 37ec838.
	var MAX_INTEGER = Number.MAX_SAFE_INTEGER || 9007199254740991;

	// Ported from Chart.js 2.7.2 37ec838.
	var INTERVALS = {
		millisecond: {
			common: true,
			size: 1,
			steps: [1, 2, 5, 10, 20, 50, 100, 250, 500]
		},
		second: {
			common: true,
			size: 1000,
			steps: [1, 2, 5, 10, 30]
		},
		minute: {
			common: true,
			size: 60000,
			steps: [1, 2, 5, 10, 30]
		},
		hour: {
			common: true,
			size: 3600000,
			steps: [1, 2, 3, 6, 12]
		},
		day: {
			common: true,
			size: 86400000,
			steps: [1, 2, 5]
		},
		week: {
			common: false,
			size: 604800000,
			steps: [1, 2, 3, 4]
		},
		month: {
			common: true,
			size: 2.628e9,
			steps: [1, 2, 3]
		},
		quarter: {
			common: false,
			size: 7.884e9,
			steps: [1, 2, 3, 4]
		},
		year: {
			common: true,
			size: 3.154e10
		}
	};

	// Ported from Chart.js 2.7.2 37ec838.
	var UNITS = Object.keys(INTERVALS);

	// Ported from Chart.js 2.7.2 37ec838.
	function momentify(value, options) {
		var parser = options.parser;
		var format = options.parser || options.format;

		if (typeof parser === 'function') {
			return parser(value);
		}

		if (typeof value === 'string' && typeof format === 'string') {
			return moment(value, format);
		}

		if (!(value instanceof moment)) {
			value = moment(value);
		}

		if (value.isValid()) {
			return value;
		}

		// Labels are in an incompatible moment format and no `parser` has been provided.
		// The user might still use the deprecated `format` option to convert his inputs.
		if (typeof format === 'function') {
			return format(value);
		}

		return value;
	}

	// Ported from Chart.js 2.7.2 37ec838.
	function determineStepSize(min, max, unit, capacity) {
		var range = max - min;
		var interval = INTERVALS[unit];
		var milliseconds = interval.size;
		var steps = interval.steps;
		var i, ilen, factor;

		if (!steps) {
			return Math.ceil(range / (capacity * milliseconds));
		}

		for (i = 0, ilen = steps.length; i < ilen; ++i) {
			factor = steps[i];
			if (Math.ceil(range / (milliseconds * factor)) <= capacity) {
				break;
			}
		}

		return factor;
	}

	// Ported from Chart.js 2.7.2 37ec838.
	function determineUnitForAutoTicks(minUnit, min, max, capacity) {
		var ilen = UNITS.length;
		var i, interval, factor;

		for (i = UNITS.indexOf(minUnit); i < ilen - 1; ++i) {
			interval = INTERVALS[UNITS[i]];
			factor = interval.steps ? interval.steps[interval.steps.length - 1] : MAX_INTEGER;

			if (interval.common && Math.ceil((max - min) / (factor * interval.size)) <= capacity) {
				return UNITS[i];
			}
		}

		return UNITS[ilen - 1];
	}

	// Ported from Chart.js 2.7.2 37ec838.
	function determineUnitForFormatting(ticks, minUnit, min, max) {
		var duration = moment.duration(moment(max).diff(moment(min)));
		var ilen = UNITS.length;
		var i, unit;

		for (i = ilen - 1; i >= UNITS.indexOf(minUnit); i--) {
			unit = UNITS[i];
			if (INTERVALS[unit].common && duration.as(unit) >= ticks.length) {
				return unit;
			}
		}

		return UNITS[minUnit ? UNITS.indexOf(minUnit) : 0];
	}

	// Ported from Chart.js 2.7.2 37ec838.
	function determineMajorUnit(unit) {
		for (var i = UNITS.indexOf(unit) + 1, ilen = UNITS.length; i < ilen; ++i) {
			if (INTERVALS[UNITS[i]].common) {
				return UNITS[i];
			}
		}
	}

	// Ported from Chart.js 2.7.2 37ec838. Modified for realtime scale.
	function generate(min, max, capacity, options, refresh) {
		var timeOpts = options.time;
		var minor = timeOpts.unit || determineUnitForAutoTicks(timeOpts.minUnit, min, max, capacity);
		var major = determineMajorUnit(minor);
		var stepSize = helpers.valueOrDefault(timeOpts.stepSize, timeOpts.unitStepSize);
		var weekday = minor === 'week' ? timeOpts.isoWeekday : false;
		// For realtime scale: Major ticks are always enabled.
		var majorTicksEnabled = true;
		var interval = INTERVALS[minor];
		var first = moment(min);
		// For realtime scale: Add refresh interval for scroll margin.
		var last = moment(max + refresh);
		var ticks = [];
		var time;

		if (!stepSize) {
			stepSize = determineStepSize(min, max, minor, capacity);
		}

		// For 'week' unit, handle the first day of week option
		if (weekday) {
			first = first.isoWeekday(weekday);
			last = last.isoWeekday(weekday);
		}

		// Align first/last ticks on unit
		first = first.startOf(weekday ? 'day' : minor);
		last = last.startOf(weekday ? 'day' : minor);

		// Make sure that the last tick include max
		if (last < max + refresh) {
			last.add(1, minor);
		}

		time = moment(first);

		if (majorTicksEnabled && major && !weekday && !timeOpts.round) {
			// Align the first tick on the previous `minor` unit aligned on the `major` unit:
			// we first aligned time on the previous `major` unit then add the number of full
			// stepSize there is between first and the previous major time.
			time.startOf(major);
			time.add(~~((first - time) / (interval.size * stepSize)) * stepSize, minor);
		}

		for (; time < last; time.add(stepSize, minor)) {
			ticks.push(+time);
		}

		ticks.push(+time);

		return ticks;
	}

	// Ported from Chart.js 2.7.2 37ec838.
	function ticksFromTimestamps(values, majorUnit) {
		var ticks = [];
		var i, ilen, value, major;

		for (i = 0, ilen = values.length; i < ilen; ++i) {
			value = values[i];
			major = majorUnit ? value === +moment(value).startOf(majorUnit) : false;

			ticks.push({
				value: value,
				major: major
			});
		}

		return ticks;
	}

	// Ported from Chart.js 2.7.2 37ec838.
	function determineLabelFormat(data, timeOpts) {
		var i, momentDate, hasTime;
		var ilen = data.length;

		// find the label with the most parts (milliseconds, minutes, etc.)
		// format all labels with the same level of detail as the most specific label
		for (i = 0; i < ilen; i++) {
			momentDate = momentify(data[i], timeOpts);
			if (momentDate.millisecond() !== 0) {
				return 'MMM D, YYYY h:mm:ss.SSS a';
			}
			if (momentDate.second() !== 0 || momentDate.minute() !== 0 || momentDate.hour() !== 0) {
				hasTime = true;
			}
		}
		if (hasTime) {
			return 'MMM D, YYYY h:mm:ss a';
		}
		return 'MMM D, YYYY';
	}

	var hidden, visibilityChange;
	if (typeof document.hidden !== 'undefined') { // Opera 12.10 and Firefox 18 and later support
		hidden = 'hidden';
		visibilityChange = 'visibilitychange';
	} else if (typeof document.msHidden !== 'undefined') {
		hidden = 'msHidden';
		visibilityChange = 'msvisibilitychange';
	} else if (typeof document.webkitHidden !== 'undefined') {
		hidden = 'webkitHidden';
		visibilityChange = 'webkitvisibilitychange';
	}

	var transitionKeys = {
		x: {
			data: ['x', 'controlPointPreviousX', 'controlPointNextX'],
			dataset: ['x'],
			tooltip: ['x', 'caretX']
		},
		y: {
			data: ['y', 'controlPointPreviousY', 'controlPointNextY'],
			dataset: ['y'],
			tooltip: ['y', 'caretY']
		}
	};

	function transition(element, keys, translate) {
		var start = element._start || {};
		var view = element._view || {};
		var model = element._model || {};
		var i, ilen;

		for (i = 0, ilen = keys.length; i < ilen; ++i) {
			var key = keys[i];
			if (start.hasOwnProperty(key)) {
				start[key] -= translate;
			}
			if (view.hasOwnProperty(key) && view !== start) {
				view[key] -= translate;
			}
			if (model.hasOwnProperty(key) && model !== view) {
				model[key] -= translate;
			}
		}
	}

	var TimeScale = Chart.scaleService.getScaleConstructor('time');

	Chart.scaleService.getScaleConstructor = function(type) {
		// For backwards compatibility
		if (type === 'time') {
			type = 'realtime';
		}
		return this.constructors.hasOwnProperty(type) ? this.constructors[type] : undefined;
	};

	var RealTimeScale = TimeScale.extend({
		initialize: function() {
			var me = this;
			var chart = me.chart;

			TimeScale.prototype.initialize.apply(me, arguments);

			// For backwards compatibility
			if (me.options.type === 'time' && !chart.options.plugins.streaming) {
				return;
			}

			var requestAnimFrame = helpers.requestAnimFrame;
			var realtime = me.realtime = me.realtime || {};
			var lastDrawn = 0;
			var visibilityChangeListener = function() {
				if (!document[hidden]) {
					realtime.head = Date.now();
					chart.update({
						duration: 0
					});
				}
			};
			document.addEventListener(visibilityChange, visibilityChangeListener, false);
			realtime.visibilityChangeListener = visibilityChangeListener;

			var frameRefresh = function() {
				var valueOrDefault = helpers.valueOrDefault;
				var realtimeOpts = me.options.realtime || {};
				var streamingOpts = chart.options.plugins.streaming || {};
				var duration = valueOrDefault(realtimeOpts.duration, streamingOpts.duration);
				var delay = valueOrDefault(realtimeOpts.delay, streamingOpts.delay);
				var frameRate = valueOrDefault(realtimeOpts.frameRate, streamingOpts.frameRate);
				var id = me.id;
				var tooltip = chart.tooltip;
				var activeTooltip = tooltip._active;
				var frameDuration = 1000 / (Math.max(frameRate, 0) || 30);
				var keys, length, meta;

				if (me.isHorizontal()) {
					length = me.width;
					keys = transitionKeys.x;
				} else {
					length = me.height;
					keys = transitionKeys.y;
				}

				var now = Date.now();
				var offset = length * (now - realtime.head) / duration;

				// Shift all the elements leftward or upward
				helpers.each(chart.data.datasets, function(dataset, datasetIndex) {
					meta = chart.getDatasetMeta(datasetIndex);
					if (id === meta.xAxisID || id === meta.yAxisID) {
						var elements = meta.data || [];
						var i, ilen;

						for (i = 0, ilen = elements.length; i < ilen; ++i) {
							transition(elements[i], keys.data, offset);
						}

						if (meta.dataset) {
							transition(meta.dataset, keys.dataset, offset);
						}
					}
				});

				// Shift tooltip leftward or upward
				if (activeTooltip && activeTooltip[0]) {
					meta = chart.getDatasetMeta(activeTooltip[0]._datasetIndex);
					if (id === meta.xAxisID || id === meta.yAxisID) {
						transition(tooltip, keys.tooltip, offset);
					}
				}

				me.max = me._table[1].time = now - delay;
				me.min = me._table[0].time = me.max - duration;

				if (lastDrawn + frameDuration <= now) {
					// Draw only when animation is inactive
					if (!chart.animating && !tooltip._start) {
						chart.draw();
					}
					chart.streaming.onDraw(chart);
					lastDrawn += frameDuration;
					if (lastDrawn + frameDuration <= now) {
						lastDrawn = now;
					}
				}

				realtime.head = now;
				realtime.frameRequestID = requestAnimFrame.call(window, frameRefresh);
			};

			realtime.head = Date.now();
			realtime.frameRequestID = requestAnimFrame.call(window, frameRefresh);
		},

		update: function() {
			var me = this;
			var options = me.options;
			var chart = me.chart;

			// For backwards compatibility
			if (options.type === 'time' && !chart.options.plugins.streaming) {
				return TimeScale.prototype.update.apply(me, arguments);
			}

			var frameRequestID = me.realtime.frameRequestID;
			var streamingOpts = chart.options.plugins.streaming || {};
			var pause = streamingOpts.pause;

			if (!frameRequestID && !pause) {
				me.initialize();
			} else if (frameRequestID && pause) {
				me.destroy();
			}

			return TimeScale.prototype.update.apply(me, arguments);
		},

		buildTicks: function() {
			var me = this;
			var options = me.options;
			var chart = me.chart;

			// For backwards compatibility
			if (options.type === 'time' && !chart.options.plugins.streaming) {
				return TimeScale.prototype.buildTicks.apply(me, arguments);
			}

			var valueOrDefault = helpers.valueOrDefault;
			var timeOpts = options.time;
			var realtimeOpts = options.realtime || {};
			var streamingOpts = chart.options.plugins.streaming || {};
			var duration = valueOrDefault(realtimeOpts.duration, streamingOpts.duration);
			var delay = valueOrDefault(realtimeOpts.delay, streamingOpts.delay);
			var refresh = valueOrDefault(streamingOpts.refresh, 0);
			var max = me.realtime.head - delay;
			var min = max - duration;
			var timestamps = [];

			switch (options.ticks.source) {
			case 'data':
				timestamps = me._timestamps.data;
				break;
			case 'labels':
				timestamps = me._timestamps.labels;
				break;
			case 'auto':
			default:
				timestamps = generate(min, max, me.getLabelCapacity(min), options, refresh);
			}

			me.min = min;
			me.max = max;

			// PRIVATE
			me._unit = timeOpts.unit || determineUnitForFormatting(timestamps, timeOpts.minUnit, me.min, me.max);
			me._majorUnit = determineMajorUnit(me._unit);
			// realtime scale only supports linear distribution.
			me._table = [{time: min, pos: 0}, {time: max, pos: 1}];
			// offset is always disabled.
			me._offsets = {left: 0, right: 0};
			me._labelFormat = determineLabelFormat(me._timestamps.data, timeOpts);

			return ticksFromTimestamps(timestamps, me._majorUnit);
		},

		fit: function() {
			var me = this;
			var options = me.options;

			TimeScale.prototype.fit.apply(me, arguments);

			// For backwards compatibility
			if (options.type === 'time' && !me.chart.options.plugins.streaming) {
				return;
			}

			if (options.ticks.display && options.display && me.isHorizontal()) {
				me.paddingLeft = 3;
				me.paddingRight = 3;
				me.handleMargins();
			}
		},

		draw: function(chartArea) {
			var me = this;
			var chart = me.chart;

			// For backwards compatibility
			if (me.options.type === 'time' && !chart.options.plugins.streaming) {
				TimeScale.prototype.draw.apply(me, arguments);
				return;
			}

			var context = me.ctx;
			var	clipArea = me.isHorizontal() ?
				{
					left: chartArea.left,
					top: 0,
					right: chartArea.right,
					bottom: chart.height
				} : {
					left: 0,
					top: chartArea.top,
					right: chart.width,
					bottom: chartArea.bottom
				};

			// Clip and draw the scale
			helpers.canvas.clipArea(context, clipArea);
			TimeScale.prototype.draw.apply(me, arguments);
			helpers.canvas.unclipArea(context);
		},

		destroy: function() {
			var realtime = this.realtime;
			var visibilityChangeListener = realtime.visibilityChangeListener;
			var frameRequestID = realtime.frameRequestID;

			if (visibilityChangeListener) {
				document.removeEventListener(visibilityChange, visibilityChangeListener, false);
				delete realtime.visibilityChangeListener;
			}
			if (frameRequestID) {
				helpers.cancelAnimFrame.call(window, frameRequestID);
				delete realtime.frameRequestID;
			}
		}
	});

	Chart.scaleService.registerScaleType('realtime', RealTimeScale, realTimeScaleDefaultConfig);
}
