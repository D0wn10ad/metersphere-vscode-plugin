package com.example.demo;

import java.util.List;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

/** Cart REST API. */
@RestController
@RequestMapping("/api")
public class CartController {

    /** Get a cart by id. */
    @Operation(summary = "Get a cart")
    @GetMapping(value = { "/a", "/b" }, produces = MediaType.APPLICATION_JSON_VALUE)
    public java.util.Map<String, java.util.List<java.util.Map<String, Integer>>> getCart(
            @RequestParam(name = "q", required = false, defaultValue = "x,y(z)") String q,
            @RequestBody @Valid @Size(min = 1, max = 10) List<EdgeDTO> dtos) {
        return null;
    }

    @RequestMapping(value = "/legacy", method = { RequestMethod.GET, RequestMethod.HEAD })
    public void legacy() {
    }
}