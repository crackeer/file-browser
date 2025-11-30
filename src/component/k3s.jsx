import React, { useEffect, useState } from 'react';
import { Button, Space, Tabs, Modal, Typography, Card, message, Radio, Input, Table, Tooltip, Popconfirm, Progress, Alert, Select } from 'antd';
import { SyncOutlined, SearchOutlined, ExportOutlined, UploadOutlined } from '@ant-design/icons';
import { sshExecuteCmd, downloadRemoteFileSync, getTransferProgress, uploadRemoteFile, uploadRemoteFileSync } from "../service/invoke";
import { open } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';
import dayjs from 'dayjs';
const { Option } = Select;
const { TextArea, Search } = Input;

// 导入资源组件
import Pods from './kubectl/pods';
import Services from './kubectl/services';
import Deployments from './kubectl/deploy';
import StatefulSets from './kubectl/statefulsets';
import IngressRoutes from './kubectl/ingressroutes';
import ConfigMaps from './kubectl/configmaps';

export default function K3sManagement({ sessionKey }) {
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, messageCtxHandler] = message.useMessage();
    const [loading, setLoading] = useState(false);

    // K3s specific states
    const [namespaces, setNamespaces] = useState([]);
    const [currentNamespace, setCurrentNamespace] = useState('default');
    const [apiResources, setApiResources] = useState([]);
    const [selectedResource, setSelectedResource] = useState('pods');
    const [refreshCount, setRefreshCount] = useState(0);
    // 全局搜索状态
    const [globalSearchText, setGlobalSearchText] = useState('');
    const [searchInput, setSearchInput] = useState('');

    // 节点列表相关状态
    const [nodes, setNodes] = useState([]);
    const [showNodesModal, setShowNodesModal] = useState(false);

    // 镜像列表相关状态
    const [images, setImages] = useState([]);
    const [showImagesModal, setShowImagesModal] = useState(false);
    const [imageSearchText, setImageSearchText] = useState('');
    const [filteredImages, setFilteredImages] = useState([]);

    // 镜像导出相关状态
    const [transferStatus, setTransferStatus] = useState({ status: '', current: 0, total: 0 });
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    
    // 批量下载镜像相关状态
    const [selectedImages, setSelectedImages] = useState([]);
    const [showBatchExportModal, setShowBatchExportModal] = useState(false);
    
    // 镜像导入相关状态
    const [importLoading, setImportLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const imageColumns = [
        {
            title: 'REF',
            dataIndex: 'ref',
            key: 'ref',
            ellipsis: {
                showTitle: false,
            },
            render: (text) => (
                <Tooltip title={text}>
                    <span>{text}</span>
                </Tooltip>
            ),
        },
        {
            title: 'DIGEST',
            dataIndex: 'digest',
            key: 'digest',
            width: 120,
            ellipsis: {
                showTitle: false,
            },
            render: (text) => (
                <Tooltip title={text}>
                    <span>{text}</span>
                </Tooltip>
            ),
        },
        {
            title: 'SIZE',
            dataIndex: 'size',
            key: 'size',
            width: 100,
            align: 'right',
        }
    ]

    // 初始化加载
    useEffect(() => {
        loadNamespaces();
    }, [sessionKey]);

    // 当namespace改变时，重新加载资源
    useEffect(() => {
        if (currentNamespace) {
            loadApiResources();
        }
    }, [currentNamespace]);

    // 当选择的资源类型改变时，不需要额外加载数据，组件内部会处理

    // 加载所有namespace
    const loadNamespaces = async () => {
        setLoading(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 'k3s kubectl get namespaces -o json');
            if (result.error) {
                messageApi.error('获取namespace列表失败: ' + result.error);
                setLoading(false);
                return;
            }

            // 获取namespaces列表并按字典顺序排序
            const namespaces = JSON.parse(result).items.map(ns => ns.metadata.name).sort();
            setNamespaces(namespaces);

            // 如果默认namespace存在，则设置为当前namespace
            if (namespaces.includes('default')) {
                setCurrentNamespace('default');
            } else if (namespaces.length > 0) {
                setCurrentNamespace(namespaces[0]);
            }
        } catch (error) {
            messageApi.error('处理namespace数据失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // 加载固定的API资源列表
    const loadApiResources = async () => {
        try {
            // 默认只展示固定的资源类型
            const fixedResources = ['deployments', 'services', 'pods', "configmaps", 'statefulsets', 'ingressroutes'];

            setApiResources(fixedResources);

            // 只有在selectedResource为空时才设置默认值，避免切换namespace时重置
            if (!selectedResource) {
                setSelectedResource('pods');
            }
        } catch (error) {
            messageApi.error('处理API资源数据失败: ' + error.message);
        }
    };

    // 根据资源类型获取对应的组件
    const getResourceComponent = () => {
        const props = { 
            sessionKey, 
            namespace: currentNamespace, 
            refreshCount,
            searchText: globalSearchText
        };

        switch (selectedResource) {
            case 'pods':
                return <Pods {...props} />;
            case 'services':
                return <Services {...props} />;
            case 'deployments':
                return <Deployments {...props} />;
            case 'statefulsets':
                return <StatefulSets {...props} />;
            case 'ingressroutes':
                return <IngressRoutes {...props} />;
            case 'configmaps':
                return <ConfigMaps {...props} />;
            default:
                return <div>未找到资源组件: {selectedResource}</div>;
        }
    };

    // 刷新所有资源
    const refreshAllResources = async () => {
        setLoading(true);
        try {
            // 增加刷新计数，触发所有资源组件重新加载数据
            setRefreshCount(prev => prev + 1);
            messageApi.success('资源刷新成功');
        } catch (error) {
            messageApi.error('刷新资源失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // 获取节点列表
    const fetchNodes = async () => {
        setLoading(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 'k3s kubectl get nodes -o json');
            if (result.error) {
                messageApi.error('获取节点列表失败: ' + result.error);
                setLoading(false);
                return;
            }

            const nodesData = JSON.parse(result).items;
            setNodes(nodesData);
            setShowNodesModal(true);
        } catch (error) {
            messageApi.error('处理节点数据失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // 获取镜像列表
    const fetchImages = async () => {
        setLoading(true);
        try {
            // 使用k3s ctr images ls命令获取完整的镜像列表信息
            let result = await sshExecuteCmd(sessionKey, 'k3s ctr images ls');
            if (result.error) {
                messageApi.error('获取镜像列表失败: ' + result.error);
                setLoading(false);
                return;
            }

            // 解析命令输出，提取完整的镜像信息
            const lines = result.split('\n').filter(line => line.trim() !== '');

            if (lines.length === 0) {
                messageApi.warning('未找到镜像列表数据');
                setLoading(false);
                return;
            }

            // 获取表头行并查找各列的位置
            const headersLine = lines[0];

            // 查找各列的起始位置
            const refIndex = headersLine.indexOf('REF');
            const typeIndex = headersLine.indexOf('TYPE');
            const digestIndex = headersLine.indexOf('DIGEST');
            const sizeIndex = headersLine.indexOf('SIZE');
            const platformsIndex = headersLine.indexOf('PLATFORMS');

            const imagesList = [];

            // 从第二行开始解析数据行
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                // 跳过分隔线和空行
                if (line && !line.startsWith('---') && !line.startsWith('DIGEST')) {
                    // 提取各列数据
                    const ref = line.substring(refIndex, typeIndex).trim();
                    const type = line.substring(typeIndex, digestIndex).trim();
                    const digest = line.substring(digestIndex, sizeIndex).trim();
                    const size = line.substring(sizeIndex, platformsIndex).trim();

                    // 不展示以'sha256:'开头的REF
                    if (!ref.startsWith('sha256:')) {
                        imagesList.push({
                            ref,
                            type,
                            digest,
                            size,
                            key: i - 1 // 添加key字段用于Table组件
                        });
                    }
                }
            }

            setImages(imagesList);
            setFilteredImages(imagesList);
            setShowImagesModal(true);
        } catch (error) {
            messageApi.error('处理镜像数据失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // 过滤镜像列表
    useEffect(() => {
        if (imageSearchText) {
            const filtered = images.filter(image =>
                image.ref.toLowerCase().includes(imageSearchText.toLowerCase())
            );
            setFilteredImages(filtered);
        } else {
            setFilteredImages(images);
        }
    }, [imageSearchText, images]);

    // 显示批量导出对话框
    const showBatchExportDialog = async () => {
        try {
            // 获取镜像列表
            await fetchImagesForBatch();
            // 显示批量导出对话框
            setSelectedImages([]);
            setShowBatchExportModal(true);
        } catch (error) {
            messageApi.error('获取镜像列表失败: ' + error.message);
        }
    };
    
    // 专门用于批量导出的获取镜像列表函数
    const fetchImagesForBatch = async () => {
        setLoading(true);
        try {
            // 使用k3s ctr images ls命令获取完整的镜像列表信息
            let result = await sshExecuteCmd(sessionKey, 'k3s ctr images ls');
            if (result.error) {
                messageApi.error('获取镜像列表失败: ' + result.error);
                setLoading(false);
                return;
            }
            
            // 解析命令输出，提取完整的镜像信息
            const lines = result.split('\n').filter(line => line.trim() !== '');
            
            if (lines.length === 0) {
                messageApi.warning('未找到镜像列表数据');
                setLoading(false);
                return;
            }
            
            // 获取表头行并查找各列的位置
            const headersLine = lines[0];
            
            // 查找各列的起始位置
            const refIndex = headersLine.indexOf('REF');
            const typeIndex = headersLine.indexOf('TYPE');
            const digestIndex = headersLine.indexOf('DIGEST');
            const sizeIndex = headersLine.indexOf('SIZE');
            const platformsIndex = headersLine.indexOf('PLATFORMS');
            
            const imagesList = [];
            
            // 从第二行开始解析数据行
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                // 跳过分隔线和空行
                if (line && !line.startsWith('---') && !line.startsWith('DIGEST')) {
                    // 提取各列数据
                    const ref = line.substring(refIndex, typeIndex).trim();
                    const type = line.substring(typeIndex, digestIndex).trim();
                    const digest = line.substring(digestIndex, sizeIndex).trim();
                    const size = line.substring(sizeIndex, platformsIndex).trim();
                    
                    // 不展示以'sha256:'开头的REF
                    if (!ref.startsWith('sha256:')) {
                        imagesList.push({
                            ref,
                            type,
                            digest,
                            size,
                            key: i - 1 // 添加key字段用于Table组件
                        });
                    }
                }
            }
            
            setImages(imagesList);
            setFilteredImages(imagesList);
        } catch (error) {
            messageApi.error('处理镜像数据失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };
    

    // 导入镜像功能
    const importImage = async () => {
        try {
            // 选择本地镜像文件
            let filePaths = await open({
                multiple: false,
                directory: false,
                filters: [
                    {
                        name: '镜像文件',
                        extensions: ['tar']
                    },
                    {
                        name: '所有文件',
                        extensions: ['*']
                    }
                ]
            });
            console.log('选择的文件路径:', filePaths);
            if (!filePaths || filePaths.length === 0) {
                return; // 用户取消了选择
            }
            
            const localFilePath = filePaths
            const fileName = localFilePath.split('/').pop();
            
            // 设置上传状态
            setImportLoading(true);
            setUploadProgress(0);
            
            // 显示加载提示
            messageApi.loading({
                key: 'importLoading',
                content: `正在上传镜像文件：${fileName}`,
                duration: 0
            });
            
            try {
                // 创建远程临时目录
                const tempDir = `/tmp/import_images_${dayjs().format('MMDD')}`;
                const mkdirResult = await sshExecuteCmd(sessionKey, `mkdir -p ${tempDir}`);
                
                if (mkdirResult.error) {
                    throw new Error('创建临时目录失败: ' + mkdirResult.error);
                }
                
                const remoteFilePath = `${tempDir}/${fileName}`;
                
                // 启动进度更新定时器
                const interval = setInterval(async () => {
                    try {
                        const progress = await getTransferProgress();
                        if (progress) {
                            console.log('上传进度:', progress);
                            let percent = progress.current / progress.total * 100;
                            messageApi.loading({
                                key: 'importLoading',
                                content: `正在上传镜像文件：${fileName} ${percent.toFixed(2)}%`,
                                duration: 0
                            });
                        }
                    } catch (e) {
                        console.error('获取进度失败:', e);
                    }
                }, 1000);
                
               
                const uploadResult = await uploadRemoteFileSync(sessionKey, localFilePath, remoteFilePath);
                console.log('上传结果:', uploadResult);
                
                // 清除进度定时器
                clearInterval(interval);
                
                if (uploadResult.error) {
                    throw new Error('上传文件失败: ' + uploadResult.error);
                }
                 // 上传文件到远程服务器
                messageApi.loading({
                    key: 'importLoading',
                    content: `正在导入镜像文件：${fileName}`,
                    duration: 0
                });
                
                // 导入镜像到K3s
                const importResult = await sshExecuteCmd(sessionKey, `k3s ctr images import ${remoteFilePath}`);
                
                if (importResult.error) {
                    throw new Error('导入镜像失败: ' + importResult.error);
                }
                
                messageApi.info({
                    key: 'importLoading',
                    content: `镜像文件：${fileName} 导入成功！`,
                })
                                
            } catch (error) {
                loadingMessage(); // 关闭loading提示
                messageApi.error(error.message);
            } finally {
                setImportLoading(false);
                setUploadProgress(0);
            }
            
        } catch (error) {
            messageApi.error('导入镜像时发生错误: ' + error.message);
            setImportLoading(false);
        }
    };
    
    // 批量导出并下载镜像
    const batchExportImages = async () => {
        if (selectedImages.length === 0) {
            messageApi.warning('请选择要导出的镜像');
            return;
        }
        
        try {

            let temp_save_dir = '/tmp/export_images_' + dayjs().format('MMDD');
            // 创建临时目录
            let mkdirResult = await sshExecuteCmd(sessionKey, `mkdir -p ${temp_save_dir}`);
            
            if (mkdirResult.error) {
                messageApi.error('创建临时目录失败: ' + mkdirResult.error);
                return;
            }
            
            setShowBatchExportModal(false);
            let successCount = 0;
            let errorCount = 0;
            // 逐个导出和下载镜像
            for (let i = 0; i < selectedImages.length; i++) {
                const imageRef = selectedImages[i];
                let parts = imageRef.split('/');
                const imageName = parts[parts.length - 1].replace(':', '_');
                const exportFileName = `${imageName}.tar`;
                const exportPath = `${temp_save_dir}/${exportFileName}`;
                                
                try {
                    // 导出镜像到远程临时文件
                    messageApi.loading(`【${i + 1} / ${selectedImages.length}】正在导出: ${imageRef}, 存放在: ${temp_save_dir}`, 0)
                    let result = await sshExecuteCmd(sessionKey, `k3s ctr images export ${exportPath} ${imageRef}`);
                    
                    if (result.error) {
                        messageApi.error(`导出镜像失败 ${imageRef}: ${result.error}`);
                        errorCount++;
                        continue;
                    }
                    
                    successCount++;
                    messageApi.destroy()
                                        
                } catch (error) {
                    messageApi.error(`处理镜像时发生错误 ${imageRef}: ${error.message}`);
                    errorCount++;
                }
            }

            messageApi.success(`批量导出镜像完成，成功 ${successCount} 个，失败 ${errorCount} 个`);
                        
        } catch (error) {
            messageApi.error('批量导出镜像时发生错误: ' + error.message);
            setTransferStatus({ status: 'error', message: error.message });
        } finally {
            setExportLoading(false);
        }
    };



    // 应用YAML
    const [showApplyYamlModal, setShowApplyYamlModal] = useState(false);
    const [yamlContent, setYamlContent] = useState('');

    const applyYaml = () => {
        setYamlContent('');
        setShowApplyYamlModal(true);
    };

    const handleApplyYaml = async () => {
        if (!yamlContent.trim()) {
            messageApi.warning('请输入YAML内容');
            return;
        }

        setLoading(true);
        try {
            // 使用echo命令将YAML内容通过管道传递给kubectl apply
            const command = `echo '${yamlContent}' | k3s kubectl apply -f - -n ${currentNamespace}`;
            let result = await sshExecuteCmd(sessionKey, command);

            if (result.error) {
                Modal.error({
                    title: 'Apply YAML 失败',
                    content: <pre style={{ whiteSpace: 'pre-wrap' }}>{result.error}</pre>,
                    width: '80%'
                });
            } else {
                Modal.info({
                    title: 'Apply YAML 成功',
                    content: <pre style={{ whiteSpace: 'pre-wrap' }}>{result}</pre>,
                    width: '80%'
                });
                // 刷新资源列表
                setRefreshCount(prev => prev + 1);
                setShowApplyYamlModal(false);
            }
        } catch (error) {
            messageApi.error('执行Apply YAML失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            {messageCtxHandler}
            {contextHolder}

            {/* 顶部布局：左侧搜索框，右侧按钮组 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                {/* 左侧搜索框 */}
                <Search
                    placeholder="搜索资源名称"
                    allowClear
                    enterButton={<SearchOutlined />}
                    value={searchInput}
                    onSearch={(value) => {
                        setSearchInput(value);
                        setGlobalSearchText(value);
                    }}
                    onChange={(e) => setSearchInput(e.target.value)}
                    style={{ maxWidth: 400 }}
                />
                
                {/* 右侧按钮组 */}
                <Space>
                    <Button
                        icon={<SyncOutlined />}
                        onClick={refreshAllResources}
                        loading={loading}
                        style={{ marginLeft: '8px' }}
                    >
                        刷新
                    </Button>
                    <Button
                        onClick={applyYaml}
                        type="primary"
                    >
                        Apply YAML
                    </Button>

                    <Button
                        type="primary"
                        onClick={fetchNodes}
                        loading={loading}
                    >
                        节点列表
                    </Button>

                    <Button
                        type="primary"
                        onClick={fetchImages}
                        loading={loading}
                    >
                        镜像列表
                    </Button>

                    <Space>
                        <Button
                            type="primary"
                            onClick={showBatchExportDialog}
                            loading={loading}

                        >
                            导出镜像
                        </Button>
                        <Button
                            icon={<UploadOutlined />}
                            onClick={importImage}
                            loading={importLoading}

                        >
                            导入镜像
                        </Button>
                    </Space>
                </Space>
            </div>
            
            {/* 命名空间选择 */}
            <Radio.Group
                value={currentNamespace}
                onChange={(e) => setCurrentNamespace(e.target.value)}
                disabled={loading}
                style={{ marginBottom: '8px' }}
            >
                {namespaces.map(ns => (
                    <Radio.Button key={ns} value={ns}>{ns}</Radio.Button>
                ))}
            </Radio.Group>

            {/* 垂直Tabs布局 */}
            <div style={{ display: 'flex', gap: '16px' }}>
                {/* 左侧垂直Tabs */}
                <div style={{ width: '120px' }}>
                    <Tabs
                        activeKey={selectedResource}
                        onChange={setSelectedResource}
                        type="card"
                        tabPosition="left"
                        style={{ height: '400px' }}
                    >
                        
                        {apiResources.map(resource => (
                            <Tabs.TabPane
                                tab={resource}
                                key={resource}
                            />
                        ))}
                    </Tabs>
                </div>

                <div style={{ flex: 1 }}>
                    {getResourceComponent()}
                </div>
            </div>

            {/* 模态框由各资源组件内部处理 */}

            {/* Apply YAML模态框 */}
            <Modal
                title="Apply YAML"
                open={showApplyYamlModal}
                onOk={handleApplyYaml}
                onCancel={() => setShowApplyYamlModal(false)}
                okText="Apply"
                cancelText="取消"
                width={800}
            >
                <TextArea
                    rows={12}
                    placeholder="输入YAML内容..."
                    value={yamlContent}
                    onChange={(e) => setYamlContent(e.target.value)}
                    style={{ fontFamily: 'monospace' }}
                />
            </Modal>

            {/* 节点列表模态框 */}
            <Modal
                title="K3s 节点列表"
                open={showNodesModal}
                onCancel={() => setShowNodesModal(false)}
                footer={null}
                width={800}
                destroyOnClose
            >
                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {nodes.map(node => (
                        <Card key={node.metadata.name} title={node.metadata.name} style={{ marginBottom: 16 }} size='small'>
                            <div>
                                <p><strong>状态:</strong> {node.status.conditions.find(c => c.type === 'Ready')?.status || 'Unknown'}</p>
                                <p><strong>角色:</strong> {node.metadata.labels['node-role.kubernetes.io/master'] ? 'Master' : 'Worker'}</p>
                                <p><strong>版本:</strong> {node.status.nodeInfo.kubeletVersion}</p>
                                <p><strong>系统:</strong> {node.status.nodeInfo.osImage}</p>
                                <p><strong>CPU:</strong> {node.status.allocatable.cpu} cores</p>
                                <p><strong>内存:</strong> {node.status.allocatable.memory}</p>
                                <p><strong>Pod CIDR:</strong> {node.spec.podCIDR}</p>
                                <p><strong>创建时间:</strong> {new Date(node.metadata.creationTimestamp).toLocaleString()}</p>
                            </div>
                        </Card>
                    ))}
                </div>
            </Modal>

            {/* 批量下载镜像模态框 */}
                <Modal
                    title="选择镜像下载"
                    open={showBatchExportModal}
                    onOk={batchExportImages}
                    onCancel={() => setShowBatchExportModal(false)}
                    okText="开始下载"
                    cancelText="取消"
                    width={'50%'}
                >
                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                        <div style={{ marginBottom: '15px' }}>
                            <Select
                                mode="multiple"
                                style={{ width: '100%' }}
                                placeholder="请选择要下载的镜像"
                                value={selectedImages}
                                onChange={setSelectedImages}
                                maxTagCount={10}
                            >
                                {images.map((image) => (
                                    <Option key={image.ref} value={image.ref}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span title={image.ref} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {image.ref}
                                            </span>
                                            <span style={{ marginLeft: '10px', color: '#666', fontSize: '12px' }}>
                                                {image.size}
                                            </span>
                                        </div>
                                    </Option>
                                ))}
                            </Select>
                        </div>
                    </div>
                </Modal>
                
                {/* 镜像列表模态框 */}
                <Modal
                    title="K3s 镜像列表"
                    open={showImagesModal}
                    onCancel={() => setShowImagesModal(false)}
                    footer={null}
                    width={1000}
                    destroyOnClose
                >
                <div style={{ marginBottom: 16 }}>
                    <Search
                        placeholder="搜索镜像名称"
                        allowClear
                        enterButton={<SearchOutlined />}
                        size="large"
                        value={imageSearchText}
                        onChange={(e) => setImageSearchText(e.target.value)}
                        style={{ maxWidth: 400 }}
                    />
                    <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                        共 {filteredImages.length} 个镜像
                    </div>
                </div>
                <Table
                    dataSource={filteredImages}
                    size='small'
                    columns={imageColumns}
                    rowKey='key'
                    pagination={{
                        pageSize: 30,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50'],
                    }}
                />
            </Modal>
        </div>
    );
}