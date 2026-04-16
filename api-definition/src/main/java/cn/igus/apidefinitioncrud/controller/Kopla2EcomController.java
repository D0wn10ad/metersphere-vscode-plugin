package cn.igus.apidefinitioncrud.controller;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.github.xiaoymin.knife4j.annotations.ApiOperationSupport;

import cn.igus.client.koplaclient.model.IDDShoppingModel;
import cn.igus.client.koplaclient.model.UserDetails;
import cn.igus.client.koplaclient.util.ApiResponseDesc;
import cn.igus.kopla.service.IAliyunBucketService;
import cn.igus.kopla.service.IAuthenticatingService;
import cn.igus.kopla.service.IKoplaShoppingCartService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
/**
 * REST controller
 * @author chwang
 * @since 1.0.0
 */
@RestController
@RequestMapping("/cart/configuration")
@Slf4j
public class Kopla2EcomController {
    private final IKoplaShoppingCartService shoppingCartService;
    private final IAliyunBucketService aliyunBucketService;
    private final IAuthenticatingService authenticatingService;

    /**
     * Constructs a new Kopla2EcomController with the specified service.
     *
     * @param shoppingCartService the shopping cart service implementation
     */
    public Kopla2EcomController(IKoplaShoppingCartService shoppingCartService,
            IAliyunBucketService aliyunBucketService, IAuthenticatingService authenticatingService) {
        this.shoppingCartService = shoppingCartService;
        this.aliyunBucketService = aliyunBucketService;
        this.authenticatingService = authenticatingService;
    }


    /**
     * Get configuration by shopping cart ID.
     * @param sid
     * @param shoppingCaStringrtId
     * @return
     */
    @Operation(summary = "Get Configuration", description = "Get Configuration by sessionId and shoppingCaStringrtId.", responses = {
            @ApiResponse(responseCode = "200", description = ApiResponseDesc.SUCCESS),
            @ApiResponse(responseCode = "400", description = ApiResponseDesc.INVALID_PARAMETERS),
            @ApiResponse(responseCode = "405", description = ApiResponseDesc.INVALID_SESSION)
    })
    @ApiOperationSupport(author = "Junhui(jgong@igus.net)")
    @GetMapping(value = "/{shopping_cart_id}")
    public IDDShoppingModel getConfiguration(
            @RequestHeader(name = "sid", required = false) String sid,
            @PathVariable(name = "shopping_cart_id") Long shoppingCaStringrtId) {
        return shoppingCartService.getConfiguration(shoppingCaStringrtId, sid);
    }

    /**
     * Get configuration by sessionId.
     * @param sid
     * @return
     */
    @Operation(summary = "Get Configuration", description = "Get Configuration by sessionId.", responses = {
            @ApiResponse(responseCode = "200", description = ApiResponseDesc.SUCCESS),
            @ApiResponse(responseCode = "400", description = ApiResponseDesc.INVALID_PARAMETERS),
            @ApiResponse(responseCode = "405", description = ApiResponseDesc.INVALID_SESSION)
    })
    @ApiOperationSupport(author = "Junhui(jgong@igus.net)")
    @GetMapping
    public IDDShoppingModel getConfiguration(
            @RequestHeader(name = "sid", required = true) String sid) {
        log.info("=======  get configuration by sid:"+sid);
        if (!authenticatingService.validateSession(sid)) {
            throw new ResponseStatusException(HttpStatus.METHOD_NOT_ALLOWED, ApiResponseDesc.INVALID_SESSION);
        }
        log.info("======= Try to add kopla data to ecom shopping cart =======");
        return shoppingCartService.getConfiguration(sid);
    }

    /**
     * Update configuration by sessionId.
     * @param sid
     * @return
     */
    @Operation(summary = "Update Configuration", description = "Update Configuration by sessionId.", responses = {
            @ApiResponse(responseCode = "200", description = ApiResponseDesc.SUCCESS),
            @ApiResponse(responseCode = "400", description = ApiResponseDesc.INVALID_PARAMETERS),
            @ApiResponse(responseCode = "405", description = ApiResponseDesc.INVALID_SESSION)
    })
    @ApiOperationSupport(author = "chwang")
    @PutMapping
    public IDDShoppingModel updateConfiguration(
            @RequestHeader(name = "sid", required = true) String sid,
            @RequestBody UserDetails userDetails) {

        log.info("=======  update configuration by sid:"+sid);
        if (!authenticatingService.validateSession(sid)) {
            throw new ResponseStatusException(HttpStatus.METHOD_NOT_ALLOWED, ApiResponseDesc.INVALID_SESSION);
        }
        log.info("======= Try to update kopla data =======");
        return shoppingCartService.updateConfiguration(sid,userDetails.getUserUuid(),userDetails.getUsci());
    }

    /**
    * Delete file by fileName.
    * @param fileName
    * @return
    */
    @Operation(summary = "Delete File", description = "Delete File by fileName.", responses = {
            @ApiResponse(responseCode = "200", description = ApiResponseDesc.SUCCESS),
            @ApiResponse(responseCode = "400", description = ApiResponseDesc.INVALID_PARAMETERS),
            @ApiResponse(responseCode = "405", description = ApiResponseDesc.INVALID_SESSION)
    })
    @ApiOperationSupport(author = "Junhui(jgong@igus.net)")
    @DeleteMapping(value = "/file/{file_name}")
    public void deleteFile(
            @PathVariable(name = "file_name", required = true) String fileName) {
        aliyunBucketService.deleteFile(fileName + ".zip");
    }

    /**
    * Download file by fileName.
    * @param response
    * @param fileName
    * @return
    */
    @Operation(summary = "Download File", description = "Download File by fileName.", responses = {
            @ApiResponse(responseCode = "200", description = ApiResponseDesc.SUCCESS),
            @ApiResponse(responseCode = "400", description = ApiResponseDesc.INVALID_PARAMETERS),
            @ApiResponse(responseCode = "405", description = ApiResponseDesc.INVALID_SESSION)
    })
    @ApiOperationSupport(author = "Junhui(jgong@igus.net)")
    @GetMapping(value = "/file/{file_name}")
    public void downloadFile(
            HttpServletResponse response,
            @PathVariable(name = "file_name") String fileName) {
        aliyunBucketService.downloadFile(response, fileName + ".zip");
    }

    /**
    * Get link by fileName.
    * @param fileName
    * @return
    */
    @Operation(summary = "Get file link", description = "Get File link by fileName.", responses = {
            @ApiResponse(responseCode = "200", description = ApiResponseDesc.SUCCESS),
            @ApiResponse(responseCode = "400", description = ApiResponseDesc.INVALID_PARAMETERS),
            @ApiResponse(responseCode = "405", description = ApiResponseDesc.INVALID_SESSION)
    })
    @ApiOperationSupport(author = "Junhui(jgong@igus.net)")
    @GetMapping(value = "/file-link/{file_name}")
    public String getFileLink(@PathVariable(name = "file_name") String fileName) {
        return aliyunBucketService.generatePresignedUrl(fileName + ".zip");
    }
}
