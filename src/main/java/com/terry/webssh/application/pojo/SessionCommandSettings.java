package com.terry.webssh.application.pojo;

import lombok.Data;

@Data
public class SessionCommandSettings {
    private boolean autoCollect = true;
    private int collectLimit = 1000;
    private int collectLines = 1;
}
