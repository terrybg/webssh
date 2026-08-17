/**
 * Split resize for left-docked multi panels + terminal.
 * - .folder-dock-bar: between two docked file panels
 * - .folder-dock-edge: between dock strip and terminal
 */
(function ($) {
  'use strict';

  var dragging = false;
  var mode = null; // 'edge' | 'bar'
  var $pane = null;
  var $leftPanel = null;
  var $rightPanel = null;
  var startX = 0;
  var leftW0 = 0;
  var rightW0 = 0;
  var paneLeft = 0;
  var paneWidth = 0;
  var rafId = null;
  var pendingX = 0;

  var MIN_DOCK = 220;
  var MIN_TERM = 320;

  function endDrag() {
    if (!dragging) {
      return;
    }
    dragging = false;
    mode = null;
    $pane = null;
    $leftPanel = null;
    $rightPanel = null;
    $('body').removeClass('split-dragging');
    if (rafId != null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function applyEdge(clientX) {
    var $panels = $pane.find('.folder-dock-strip .folder-win.docked').not('.minimized');
    if (!$panels.length) {
      return;
    }
    var $target = $panels.last();
    var others = 0;
    $panels.each(function () {
      if (this === $target[0]) {
        return;
      }
      others += $(this).outerWidth() || MIN_DOCK;
    });
    var bars = $pane.find('.folder-dock-strip .folder-dock-bar:visible').length * 6;
    var stripW = clientX - paneLeft;
    var targetW = stripW - others - bars;
    var maxTarget = paneWidth - MIN_TERM - others - bars - 6;
    targetW = Math.max(MIN_DOCK, Math.min(maxTarget, targetW));
    if (window.FolderWindows && window.FolderWindows.setDockPanelWidth) {
      window.FolderWindows.setDockPanelWidth($target, targetW);
    } else {
      $target.css('width', Math.round(targetW) + 'px');
    }
  }

  function applyBar(clientX) {
    if (!$leftPanel || !$rightPanel) {
      return;
    }
    var dx = clientX - startX;
    var lw = leftW0 + dx;
    var rw = rightW0 - dx;
    if (lw < MIN_DOCK) {
      rw -= (MIN_DOCK - lw);
      lw = MIN_DOCK;
    }
    if (rw < MIN_DOCK) {
      lw -= (MIN_DOCK - rw);
      rw = MIN_DOCK;
    }
    if (lw < MIN_DOCK || rw < MIN_DOCK) {
      return;
    }
    if (window.FolderWindows && window.FolderWindows.setDockPanelWidth) {
      window.FolderWindows.setDockPanelWidth($leftPanel, lw);
      window.FolderWindows.setDockPanelWidth($rightPanel, rw);
    } else {
      $leftPanel.css('width', Math.round(lw) + 'px');
      $rightPanel.css('width', Math.round(rw) + 'px');
    }
  }

  function schedule(clientX) {
    pendingX = clientX;
    if (rafId != null) {
      return;
    }
    rafId = window.requestAnimationFrame(function () {
      rafId = null;
      if (mode === 'edge') {
        applyEdge(pendingX);
      } else if (mode === 'bar') {
        applyBar(pendingX);
      }
    });
  }

  $(document).on('mousedown.splitpane', '.remote-pane .folder-dock-edge', function (e) {
    if (e.which !== 1 && e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    $pane = $(this).closest('.remote-pane');
    if (!$pane.length || !$pane.hasClass('active')) {
      return;
    }
    paneLeft = $pane[0].getBoundingClientRect().left;
    paneWidth = $pane.outerWidth();
    mode = 'edge';
    dragging = true;
    $('body').addClass('split-dragging');
    schedule(e.clientX);
  });

  $(document).on('mousedown.splitpane', '.remote-pane .folder-dock-bar', function (e) {
    if (e.which !== 1 && e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    $pane = $(this).closest('.remote-pane');
    if (!$pane.length || !$pane.hasClass('active')) {
      return;
    }
    $leftPanel = $(this).prevAll('.folder-win.docked').not('.minimized').first();
    $rightPanel = $(this).nextAll('.folder-win.docked').not('.minimized').first();
    if (!$leftPanel.length || !$rightPanel.length) {
      return;
    }
    startX = e.clientX;
    leftW0 = $leftPanel.outerWidth();
    rightW0 = $rightPanel.outerWidth();
    mode = 'bar';
    dragging = true;
    $('body').addClass('split-dragging');
  });

  $(document).on('mousemove.splitpane', function (e) {
    if (!dragging) {
      return;
    }
    e.preventDefault();
    schedule(e.clientX);
  });

  $(document).on('mouseup.splitpane', endDrag);
  $(window).on('blur.splitpane', endDrag);
  $(document).on('selectstart.splitpane', function (e) {
    if (dragging) {
      e.preventDefault();
    }
  });
})(jQuery);
