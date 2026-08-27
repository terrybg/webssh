/**
 * Report async SFTP operations to parent desktop (OperationHub).
 */
(function (w) {
    'use strict';

    function query(name) {
        try {
            return new URL(w.location.href).searchParams.get(name) || '';
        } catch (e) {
            return '';
        }
    }

    function ctx() {
        return {
            tagId: (typeof currentTagId === 'function' ? currentTagId() : '') || query('tagId'),
            sessionId: (typeof sessionId !== 'undefined' ? sessionId : '') || query('sessionId'),
            sessionName: query('sessionName') || (typeof sessionName !== 'undefined' ? sessionName : '')
        };
    }

    function emit(action, data) {
        var payload = Object.assign({
            type: 'webssh-operation',
            action: action,
            ts: Date.now()
        }, ctx(), data || {});
        try {
            if (w.parent && w.parent !== w) {
                w.parent.postMessage(payload, '*');
            }
        } catch (e) { /* ignore */ }
        return payload;
    }

    w.WebsshOperation = {
        context: ctx,
        start: function (opts) {
            return emit('start', opts);
        },
        update: function (opts) {
            return emit('update', opts);
        },
        finish: function (opts) {
            return emit('finish', opts);
        },
        remove: function (id) {
            return emit('remove', { id: id });
        }
    };
}(window));
