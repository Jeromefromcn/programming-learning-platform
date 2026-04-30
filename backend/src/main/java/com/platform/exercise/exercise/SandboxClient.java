package com.platform.exercise.exercise;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.List;

@Component
public class SandboxClient {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String sandboxUrl;

    public SandboxClient(
            ObjectMapper objectMapper,
            @Value("${app.sandbox.url:http://sandbox:5000}") String sandboxUrl) {
        this.restTemplate = new RestTemplate();
        this.objectMapper = objectMapper;
        this.sandboxUrl = sandboxUrl;
    }

    public JsonNode execute(String code, List<VerifyRequest.TestCaseItem> testCases, int timeLimitSeconds) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("code", code);
        body.put("timeLimitSeconds", timeLimitSeconds);
        body.put("memoryLimitMb", 128);
        ArrayNode cases = body.putArray("testCases");
        for (VerifyRequest.TestCaseItem tc : testCases) {
            ObjectNode c = cases.addObject();
            c.put("input", tc.input() == null ? "" : tc.input());
            c.put("expectedOutput", tc.expectedOutput() == null ? "" : tc.expectedOutput());
        }
        try {
            return restTemplate.postForObject(sandboxUrl + "/execute", body, JsonNode.class);
        } catch (RestClientException e) {
            throw new SandboxUnavailableException("Sandbox unavailable: " + e.getMessage());
        }
    }

    public static class SandboxUnavailableException extends RuntimeException {
        public SandboxUnavailableException(String msg) { super(msg); }
    }
}
