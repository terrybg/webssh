//
// Source code recreated from a .class file by IntelliJ IDEA
// (powered by FernFlower decompiler)
//

package com.terry.webssh.application.pojo;

import lombok.Data;

@Data
public class StatusContent<T> {
    public int status;
    public String message;
    public T result;

    public StatusContent() {
        this(StatusContent.Status.SUCCESS.num, (String)null);
    }

    public StatusContent(int status, String message, T result) {
        this.status = status;
        this.message = message;
        this.result = result;
    }

    public StatusContent(int status, String message) {
        this(status, message, null);
    }

    public StatusContent(String message) {
        this(StatusContent.Status.SUCCESS.num, message);
    }

    public StatusContent(String message, T t) {
        this(StatusContent.Status.SUCCESS.num, message, t);
    }

    public static <T> StatusContent<T> ok(String message) {
        return new StatusContent(message);
    }

    public static <T> StatusContent<T> ok(String message, T t) {
        return new StatusContent(message, t);
    }

    public static <T> StatusContent<T> error(String message) {
        return new StatusContent(StatusContent.Status.ERROR.num, message);
    }

    static enum Status {
        SUCCESS(200),
        ERROR(500);

        private Integer num;

        private Status(Integer num) {
            this.num = num;
        }
    }
}
