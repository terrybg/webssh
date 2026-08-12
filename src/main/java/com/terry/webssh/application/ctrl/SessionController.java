package com.terry.webssh.application.ctrl;

import com.terry.webssh.application.pojo.SessionConfig;
import com.terry.webssh.application.pojo.StatusContent;
import com.terry.webssh.application.store.SessionRepository;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/webssh/api/sessions")
@CrossOrigin
public class SessionController {
    private final SessionRepository repo;

    public SessionController(SessionRepository repo) {
        this.repo = repo;
    }

    @GetMapping
    public StatusContent<Map<String, Object>> list() {
        Map<String, Object> result = new HashMap<>();
        result.put("items", repo.list());
        return StatusContent.ok("成功！", result);
    }

    @PostMapping
    public StatusContent<SessionConfig> create(@RequestBody SessionConfig body) {
        try {
            return StatusContent.ok("成功！", repo.create(body));
        } catch (IllegalArgumentException e) {
            return StatusContent.error(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public StatusContent<SessionConfig> update(@PathVariable String id, @RequestBody SessionConfig body) {
        try {
            return StatusContent.ok("成功！", repo.update(id, body));
        } catch (IllegalArgumentException e) {
            return StatusContent.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public StatusContent<Boolean> delete(@PathVariable String id) {
        boolean removed = repo.delete(id);
        if (!removed) {
            return StatusContent.error("session not found");
        }
        return StatusContent.ok("成功！", true);
    }
}
