'use strict';

export default function(Chart) {

	var helpers = Chart.helpers;

	// Ported from chartjs-plugin-zoom 0.6.3 9e7bc34
	var zoomNS = Chart.Zoom = Chart.Zoom || {};

	// Ported from chartjs-plugin-zoom 0.6.3 9e7bc34
	zoomNS.zoomFunctions = zoomNS.zoomFunctions || {};
	zoomNS.panFunctions = zoomNS.panFunctions || {};

	// Ported from chartjs-plugin-zoom 0.6.3 9e7bc34
	function rangeMaxLimiter(zoomPanOptions, newMax) {
		if (zoomPanOptions.scaleAxes && zoomPanOptions.rangeMax &&
				!helpers.isNullOrUndef(zoomPanOptions.rangeMax[zoomPanOptions.scaleAxes])) {
			var rangeMax = zoomPanOptions.rangeMax[zoomPanOptions.scaleAxes];
			if (newMax > rangeMax) {
				newMax = rangeMax;
			}
		}
		return newMax;
	}

	// Ported from chartjs-plugin-zoom 0.6.3 9e7bc34
	function rangeMinLimiter(zoomPanOptions, newMin) {
		if (zoomPanOptions.scaleAxes && zoomPanOptions.rangeMin &&
				!helpers.isNullOrUndef(zoomPanOptions.rangeMin[zoomPanOptions.scaleAxes])) {
			var rangeMin = zoomPanOptions.rangeMin[zoomPanOptions.scaleAxes];
			if (newMin < rangeMin) {
				newMin = rangeMin;
			}
		}
		return newMin;
	}

	function zoomRealTimeScale(scale, zoom, center, zoomOptions) {
		var options = scale.options;
		var realtimeOpts = options.realtime = options.realtime;
		var streamingOpts = scale.chart.options.plugins.streaming || {};
		var duration = helpers.valueOrDefault(realtimeOpts.duration, streamingOpts.duration);
		var delay = helpers.valueOrDefault(realtimeOpts.delay, streamingOpts.delay);
		var newDuration = duration * (2 - zoom);
		var maxPercent, limitedDuration;

		if (scale.isHorizontal()) {
			maxPercent = (scale.right - center.x) / (scale.right - scale.left);
		} else {
			maxPercent = (scale.bottom - center.y) / (scale.bottom - scale.top);
		}
		if (zoom < 1) {
			limitedDuration = rangeMaxLimiter(zoomOptions, newDuration);
		} else {
			limitedDuration = rangeMinLimiter(zoomOptions, newDuration);
		}
		realtimeOpts.duration = limitedDuration;
		realtimeOpts.delay = delay + maxPercent * (duration - limitedDuration);
	}

	function panRealTimeScale(scale, delta, panOptions) {
		var options = scale.options;
		var realtimeOpts = options.realtime = options.realtime;
		var streamingOpts = scale.chart.options.plugins.streaming || {};
		var delay = helpers.valueOrDefault(realtimeOpts.delay, streamingOpts.delay);
		var newDelay = delay + (scale.getValueForPixel(delta) - scale.getValueForPixel(0));

		if (delta > 0) {
			realtimeOpts.delay = rangeMaxLimiter(panOptions, newDelay);
		} else {
			realtimeOpts.delay = rangeMinLimiter(panOptions, newDelay);
		}
	}

	zoomNS.zoomFunctions.realtime = zoomRealTimeScale;
	zoomNS.panFunctions.realtime = panRealTimeScale;

	zoomNS.updateResetZoom = function(chart) {
		chart.resetZoom = function() {
			helpers.each(chart.scales, function(scale) {
				var timeOptions = scale.options.time;
				var realtimeOptions = scale.options.realtime;
				var tickOptions = scale.options.ticks;

				if (timeOptions) {
					timeOptions.min = scale.originalOptions.time.min;
					timeOptions.max = scale.originalOptions.time.max;
				}

				if (realtimeOptions) {
					realtimeOptions.duration = scale.originalOptions.realtime.duration;
					realtimeOptions.delay = scale.originalOptions.realtime.delay;
				}

				if (tickOptions) {
					tickOptions.min = scale.originalOptions.ticks.min;
					tickOptions.max = scale.originalOptions.ticks.max;
				}
			});

			chart.update({
				duration: 0
			});
		};
	};
}
