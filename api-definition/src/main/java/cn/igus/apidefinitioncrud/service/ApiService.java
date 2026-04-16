package cn.igus.apidefinitioncrud.service;

/**
 * 接口定义服务层接口
 */
public interface ApiService {
    // 新增接口定义
    String addApi(String apiName, String apiPath, String method);

    // 删除接口定义
    String deleteApi(Long apiId);

    // 修改接口定义
    String updateApi(Long apiId, String apiName, String apiPath, String method);

    // 查询接口定义
    String getApi(Long apiId);

    // 生成随机一句话（供接口调用）
    String getRandomSentence();
}