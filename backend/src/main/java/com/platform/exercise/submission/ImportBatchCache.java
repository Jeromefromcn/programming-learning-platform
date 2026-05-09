package com.platform.exercise.submission;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.concurrent.TimeUnit;

@Component
public class ImportBatchCache {

    private final Cache<String, byte[]> cache = Caffeine.newBuilder()
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .maximumSize(2000)
            .build();

    public void put(String batchId, String filename, byte[] bytes) {
        cache.put(batchId + ":" + filename, bytes);
    }

    public Optional<byte[]> get(String batchId, String filename) {
        return Optional.ofNullable(cache.getIfPresent(batchId + ":" + filename));
    }
}
