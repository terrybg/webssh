/**
 * Smooth left/right split for remote panes (file browser | terminal).
 * Fixes: hit-test on bar, pageX-as-width, iframe eating mousemove.
 */
(function ($) {
  'use strict';

  var dragging = false;
  var $activePane = null;
  var paneLeft = 0;
  var paneWidth = 0;
  var barWidth = 6;
  var minLeft = 200;
  var minRight = 320;
  var rafId = null;
  var pendingX = 0;

  function applyLeftWidth(clientX) {
    if (!$activePane || !$activePane.length) {
      return;
    }
    var leftWidth = clientX - paneLeft;
    var maxLeft = paneWidth - minRight - barWidth;
    if (maxLeft < minLeft) {
      maxLeft = minLeft;
    }
    if (leftWidth < minLeft) {
      leftWidth = minLeft;
    }
    if (leftWidth > maxLeft) {
      leftWidth = maxLeft;
    }
    $activePane.find('.leftDiv').css('width', Math.round(leftWidth) + 'px');
  }

  function scheduleApply(clientX) {
    pendingX = clientX;
    if (rafId != null) {
      return;
    }
    rafId = window.requestAnimationFrame(function () {
      rafId = null;
      applyLeftWidth(pendingX);
    });
  }

  function endDrag() {
    if (!dragging) {
      return;
    }
    dragging = false;
    $activePane = null;
    $('body').removeClass('split-dragging');
    if (rafId != null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  $(document).on('mousedown.splitpane', '.remote-pane .move-bar', function (e) {
    if (e.which !== 1 && e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    $activePane = $(this).closest('.remote-pane');
    if (!$activePane.length || !$activePane.hasClass('active')) {
      return;
    }

    var el = $activePane[0];
    paneLeft = el.getBoundingClientRect().left;
    paneWidth = $activePane.outerWidth();
    dragging = true;
    $('body').addClass('split-dragging');
    scheduleApply(e.clientX);
  });

  $(document).on('mousemove.splitpane', function (e) {
    if (!dragging) {
      return;
    }
    e.preventDefault();
    scheduleApply(e.clientX);
  });

  $(document).on('mouseup.splitpane', endDrag);
  $(window).on('blur.splitpane', endDrag);

  // Prefer prevent selection while dragging
  $(document).on('selectstart.splitpane', function (e) {
    if (dragging) {
      e.preventDefault();
    }
  });
})(jQuery);
