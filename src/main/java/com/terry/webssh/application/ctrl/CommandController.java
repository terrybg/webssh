package com.terry.webssh.application.ctrl;

import cn.hutool.core.util.StrUtil;
import com.terry.webssh.application.pojo.CommandItem;
import com.terry.webssh.application.pojo.SessionCommandSettings;
import com.terry.webssh.application.pojo.StatusContent;
import com.terry.webssh.application.store.CommandRepository;
import com.terry.webssh.application.store.SessionRepository;
import lombok.Data;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/webssh/api/commands")
@CrossOrigin
public class CommandController {
    private final CommandRepository commandRepository;
    private final SessionRepository sessionRepository;

    public CommandController(CommandRepository commandRepository, SessionRepository sessionRepository) {
        this.commandRepository = commandRepository;
        this.sessionRepository = sessionRepository;
    }

    @GetMapping
    public StatusContent<?> list(@RequestParam String scope,
                                 @RequestParam(required = false) String sessionId) {
        try {
            if ("global".equals(scope)) {
                return StatusContent.ok("成功！", commandRepository.listGlobal());
            }
            if ("session".equals(scope)) {
                requireSession(sessionId);
                return StatusContent.ok("成功！", commandRepository.listSession(sessionId));
            }
            return StatusContent.error("scope must be global or session");
        } catch (IllegalArgumentException e) {
            return StatusContent.error(e.getMessage());
        }
    }

    @GetMapping("/for-session/{sessionId}")
    public StatusContent<Map<String, List<CommandItem>>> listForSession(@PathVariable String sessionId) {
        return StatusContent.ok("成功！", commandRepository.listForSession(sessionId));
    }

    @PostMapping
    public StatusContent<CommandItem> create(@RequestBody CommandRequest body) {
        try {
            if (body == null) {
                return StatusContent.error("body is required");
            }
            if ("global".equals(body.getScope())) {
                return StatusContent.ok("成功！", commandRepository.createGlobal(body.getName(), body.getValue()));
            }
            if ("session".equals(body.getScope())) {
                requireSession(body.getSessionId());
                return StatusContent.ok("成功！",
                        commandRepository.createSession(body.getSessionId(), body.getName(), body.getValue()));
            }
            return StatusContent.error("scope must be global or session");
        } catch (IllegalArgumentException e) {
            return StatusContent.error(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public StatusContent<CommandItem> update(@PathVariable String id,
                                             @RequestParam String scope,
                                             @RequestParam(required = false) String sessionId,
                                             @RequestBody CommandRequest body) {
        try {
            if (body == null) {
                return StatusContent.error("body is required");
            }
            if ("global".equals(scope)) {
                return StatusContent.ok("成功！",
                        commandRepository.updateGlobal(id, body.getName(), body.getValue()));
            }
            if ("session".equals(scope)) {
                requireSession(sessionId);
                return StatusContent.ok("成功！",
                        commandRepository.updateSession(sessionId, id, body.getName(), body.getValue()));
            }
            return StatusContent.error("scope must be global or session");
        } catch (IllegalArgumentException e) {
            return StatusContent.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public StatusContent<Boolean> delete(@PathVariable String id,
                                         @RequestParam String scope,
                                         @RequestParam(required = false) String sessionId) {
        try {
            boolean removed;
            if ("global".equals(scope)) {
                removed = commandRepository.deleteGlobal(id);
            } else if ("session".equals(scope)) {
                requireSession(sessionId);
                removed = commandRepository.deleteSession(sessionId, id);
            } else {
                return StatusContent.error("scope must be global or session");
            }
            if (!removed) {
                return StatusContent.error("command not found");
            }
            return StatusContent.ok("成功！", true);
        } catch (IllegalArgumentException e) {
            return StatusContent.error(e.getMessage());
        }
    }

    @GetMapping("/settings")
    public StatusContent<SessionCommandSettings> getSettings(@RequestParam String sessionId) {
        try {
            requireSession(sessionId);
            return StatusContent.ok("成功！", commandRepository.getSettings(sessionId));
        } catch (IllegalArgumentException e) {
            return StatusContent.error(e.getMessage());
        }
    }

    @PutMapping("/settings")
    public StatusContent<SessionCommandSettings> putSettings(@RequestParam String sessionId,
                                                             @RequestBody SessionCommandSettings body) {
        try {
            requireSession(sessionId);
            if (body == null) {
                return StatusContent.error("body is required");
            }
            return StatusContent.ok("成功！", commandRepository.saveSettings(sessionId, body));
        } catch (IllegalArgumentException e) {
            return StatusContent.error(e.getMessage());
        }
    }

    @PostMapping("/collect")
    public StatusContent<Map<String, Object>> collect(@RequestBody CollectRequest body) {
        try {
            if (body == null) {
                return StatusContent.error("body is required");
            }
            requireSession(body.getSessionId());
            int collected = commandRepository.collect(body.getSessionId(), body.getText());
            return StatusContent.ok("成功！", Collections.singletonMap("collected", collected));
        } catch (IllegalArgumentException e) {
            return StatusContent.error(e.getMessage());
        }
    }

    private void requireSession(String sessionId) {
        if (StrUtil.isBlank(sessionId)) {
            throw new IllegalArgumentException("sessionId is required");
        }
        if (sessionRepository.get(sessionId) == null) {
            throw new IllegalArgumentException("session not found: " + sessionId);
        }
    }

    @Data
    public static class CommandRequest {
        private String scope;
        private String sessionId;
        private String name;
        private String value;
    }

    @Data
    public static class CollectRequest {
        private String sessionId;
        private String text;
    }
}
