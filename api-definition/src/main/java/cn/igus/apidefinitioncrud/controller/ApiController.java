package cn.igus.apidefinitioncrud.controller;

import cn.igus.apidefinitioncrud.service.ApiService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

/**
 * 接口定义控制器层，提供增删改查REST接口
 */
@RestController // 标记为REST控制器，返回JSON格式数据
@RequestMapping("/api/definition") // 接口统一前缀
public class ApiController {

    // 自动注入Service层对象（Spring依赖注入）
    @Autowired
    private ApiService apiService;

    /**
     * 新增接口定义（POST请求，带参数）
     * 示例调用：http://localhost:8080/api/definition/add?apiName=用户查询&apiPath=/user/get&method=GET
     */
    @PostMapping("/add")
    public String addApi(
            @RequestParam("apiName") String apiName,  // 必传参数：接口名称
            @RequestParam("apiPath") String apiPath,  // 必传参数：接口路径
            @RequestParam("method") String method     // 必传参数：请求方法（GET/POST等）
    ) {
        return apiService.addApi(apiName, apiPath, method);
    }

    /**
     * 删除接口定义（DELETE请求，带参数）
     * 示例调用：http://localhost:8080/api/definition/delete?apiId=1
     */
    @DeleteMapping("/delete")
    public String deleteApi(
            @RequestParam("apiId") Long apiId  // 必传参数：接口ID
    ) {
        return apiService.deleteApi(apiId);
    }

    /**
     * 修改接口定义（PUT请求，带参数）
     * 示例调用：http://localhost:8080/api/definition/update?apiId=1&apiName=用户新增&apiPath=/user/add&method=POST
     */
    @PutMapping("/update")
    public String updateApi(
            @RequestParam("apiId") Long apiId,        // 必传参数：接口ID
            @RequestParam("apiName") String apiName,  // 必传参数：新接口名称
            @RequestParam("apiPath") String apiPath,  // 必传参数：新接口路径
            @RequestParam("method") String method     // 必传参数：新请求方法
    ) {
        return apiService.updateApi(apiId, apiName, apiPath, method);
    }

    /**
     * 查询接口定义（GET请求，带参数）
     * 示例调用：http://localhost:8080/api/definition/get?apiId=1
     */
    @GetMapping("/get")
    public int getApi(
            @RequestParam("apiId") Long apiId  // 必传参数：接口ID
    ) {
         apiService.getApi(apiId);
        return 1;
    }

}