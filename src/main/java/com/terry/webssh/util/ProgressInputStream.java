package com.terry.webssh.util;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.function.BiConsumer;

/**
 * Counts bytes read and notifies a listener (throttled by caller if needed).
 */
public class ProgressInputStream extends FilterInputStream {

    private final long total;
    private final BiConsumer<Long, Long> onProgress;
    private long readCount = 0L;
    private long lastReported = -1L;

    public ProgressInputStream(InputStream in, long total, BiConsumer<Long, Long> onProgress) {
        super(in);
        this.total = total < 0 ? 0 : total;
        this.onProgress = onProgress;
    }

    private void report(boolean force) {
        if (onProgress == null) {
            return;
        }
        if (!force && readCount == lastReported) {
            return;
        }
        // Throttle: every ~2% or every 256KB, and always on force/complete
        long step = Math.max(256L * 1024L, total > 0 ? total / 50 : 256L * 1024L);
        if (!force && lastReported >= 0 && (readCount - lastReported) < step && readCount < total) {
            return;
        }
        lastReported = readCount;
        onProgress.accept(readCount, total);
    }

    @Override
    public int read() throws IOException {
        int b = super.read();
        if (b >= 0) {
            readCount += 1;
            report(false);
        } else {
            report(true);
        }
        return b;
    }

    @Override
    public int read(byte[] b, int off, int len) throws IOException {
        int n = super.read(b, off, len);
        if (n > 0) {
            readCount += n;
            report(false);
        } else if (n < 0) {
            report(true);
        }
        return n;
    }
}
