import React, { useEffect, useState } from 'react';
import { Button, Space, Tabs, Modal, Table, Typography, Card, message, Spin, Dropdown, Input, Empty, Select } from 'antd';
import { SyncOutlined} from '@ant-design/icons';
import { sshExecuteCmd } from "../service/invoke"
import lodash from 'lodash'
const { Link } = Typography;
const { Option } = Select;
const { TextArea } = Input;

export default function K3sManagement({ sessionKey }) {
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, messageCtxHandler] = message.useMessage();
    const [loading, setLoading] = useState(false);
    
    // K3s specific states
    const [namespaces, setNamespaces] = useState([]);
    const [currentNamespace, setCurrentNamespace] = useState('default');
    const [apiResources, setApiResources] = useState([]);
    const [selectedResource, setSelectedResource] = useState('pods');
    const [resourceData, setResourceData] = useState([]);
    const [resourceColumns, setResourceColumns] = useState([]);
    const [resourceDetails, setResourceDetails] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showRawYamlModal, setShowRawYamlModal] = useState(false);
    const [rawYaml, setRawYaml] = useState('');
    const [loadingYaml, setLoadingYaml] = useState(false);
    
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
    
    // 当选择的资源类型改变时，重新加载数据
    useEffect(() => {
        if (currentNamespace && selectedResource) {
            loadResourceData();
        }
    }, [currentNamespace, selectedResource]);
    
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
            
            const namespaces = JSON.parse(result).items.map(ns => ns.metadata.name);
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
    
    // 加载所有可用的API资源
    const loadApiResources = async () => {
        try {
            let result = await sshExecuteCmd(sessionKey, 'k3s kubectl api-resources --verbs=list -o name');
            if (result.error) {
                messageApi.error('获取API资源列表失败: ' + result.error);
                return;
            }
            
            // 处理结果，去除空行并按字母排序
            const resources = result.split('\n')
                .map(r => r.trim())
                .filter(r => r.length > 0)
                .sort();
            
            setApiResources(resources);
            
            // 如果pods资源存在，则默认选择它
            if (resources.includes('pods')) {
                setSelectedResource('pods');
            } else if (resources.length > 0) {
                setSelectedResource(resources[0]);
            }
        } catch (error) {
            messageApi.error('处理API资源数据失败: ' + error.message);
        }
    };
    
    // 加载指定资源的数据
    const loadResourceData = async () => {
        setLoading(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl get ${selectedResource} -n ${currentNamespace} -o json`);
            
            if (result.error) {
                messageApi.error(`获取${selectedResource}数据失败: ` + result.error);
                setResourceData([]);
                setResourceColumns([]);
                setLoading(false);
                return;
            }
            
            const data = JSON.parse(result);
            if (data.items && Array.isArray(data.items)) {
                // 处理资源数据，提取公共字段
                const items = processResourceItems(data.items);
                setResourceData(items);
                
                // 动态生成表格列
                const columns = generateResourceColumns(items);
                setResourceColumns(columns);
            } else {
                messageApi.warning(`没有找到${selectedResource}的数据`);
                setResourceData([]);
                setResourceColumns([]);
            }
        } catch (error) {
            messageApi.error('处理资源数据失败: ' + error.message);
            setResourceData([]);
            setResourceColumns([]);
        } finally {
            setLoading(false);
        }
    };
    
    // 处理资源项，提取关键信息
    const processResourceItems = (items) => {
        return items.map(item => {
            // 提取基本信息
            const baseInfo = {
                name: item.metadata.name,
                namespace: item.metadata.namespace,
                age: calculateAge(item.metadata.creationTimestamp),
                _raw: item // 保存原始数据用于查看详情
            };
            
            // 根据资源类型提取额外信息
            switch(selectedResource) {
                case 'pods':
                    return {
                        ...baseInfo,
                        status: item.status.phase,
                        ready: item.status.containerStatuses ? 
                            item.status.containerStatuses.filter(c => c.ready).length + '/' + item.status.containerStatuses.length : 
                            '0/0',
                        restarts: item.status.containerStatuses ? 
                            item.status.containerStatuses.reduce((sum, c) => sum + (c.restartCount || 0), 0) : 
                            0,
                        node: item.spec.nodeName || '-'  
                    };
                case 'services':
                    return {
                        ...baseInfo,
                        type: item.spec.type,
                        clusterIP: item.spec.clusterIP || '-',
                        ports: item.spec.ports ? 
                            item.spec.ports.map(p => `${p.port}:${p.targetPort}`).join(', ') : 
                            '-'
                    };
                case 'deployments':
                case 'statefulsets':
                case 'daemonsets':
                    return {
                        ...baseInfo,
                        ready: item.status.readyReplicas || 0 + '/' + (item.status.replicas || 0),
                        upToDate: item.status.updatedReplicas || 0,
                        available: item.status.availableReplicas || 0,
                        age: calculateAge(item.metadata.creationTimestamp)
                    };
                case 'configmaps':
                case 'secrets':
                    return {
                        ...baseInfo,
                        data: Object.keys(item.data || {}).length
                    };
                default:
                    // 对于其他资源类型，尝试提取一些通用信息
                    return {
                        ...baseInfo,
                        labels: item.metadata.labels ? Object.entries(item.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ') : '-'
                    };
            }
        });
    };
    
    // 生成表格列配置
    const generateResourceColumns = (items) => {
        if (!items || items.length === 0) return [];
        
        // 获取第一个项目的所有键
        const firstItem = items[0];
        const keys = Object.keys(firstItem).filter(key => key !== '_raw');
        
        // 基础列配置
        const columns = keys.map(key => {
            let title = key.charAt(0).toUpperCase() + key.slice(1);
            
            // 自定义一些列的渲染方式
            if (key === 'name') {
                return {
                    title: '名称',
                    dataIndex: key,
                    key: key,
                    render: (text, record) => (
                        <a href="javascript:void(0)" onClick={() => showResourceDetails(record)}>
                            {text}
                        </a>
                    )
                };
            }
            
            return {
                title: title,
                dataIndex: key,
                key: key
            };
        });
        
        // 添加操作列
        columns.push({
            title: '操作',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button size="small" onClick={() => showResourceDetails(record)}>
                        详情
                    </Button>
                    <Button size="small" onClick={() => showResourceYaml(record.name)}>
                        YAML
                    </Button>
                </Space>
            )
        });
        
        return columns;
    };
    
    // 显示资源详情
    const showResourceDetails = (record) => {
        setResourceDetails(record._raw);
        setShowDetailsModal(true);
    };
    
    // 显示资源的YAML
    const showResourceYaml = async (resourceName) => {
        setLoadingYaml(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl get ${selectedResource} ${resourceName} -n ${currentNamespace} -o yaml`);
            
            if (result.error) {
                messageApi.error('获取YAML失败: ' + result.error);
                return;
            }
            
            setRawYaml(result);
            setShowRawYamlModal(true);
        } catch (error) {
            messageApi.error('处理YAML数据失败: ' + error.message);
        } finally {
            setLoadingYaml(false);
        }
    };
    
    // 计算资源创建时间到现在的时间差
    const calculateAge = (timestamp) => {
        const now = new Date();
        const created = new Date(timestamp);
        const diffMs = now - created;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffDays > 0) return `${diffDays}d`;
        if (diffHours > 0) return `${diffHours}h`;
        if (diffMins > 0) return `${diffMins}m`;
        return '刚刚';
    };
    
    // 刷新当前资源数据
    const refreshResourceData = () => {
        loadResourceData();
    };
    
    // 执行自定义命令
    const executeCustomCommand = () => {
        Modal.confirm({
            title: '执行自定义kubectl命令',
            content: (
                <TextArea 
                    rows={4} 
                    placeholder="输入kubectl命令，例如: get pods -A"
                    id="custom-command"
                />
            ),
            onOk: async () => {
                const command = document.getElementById('custom-command').value;
                if (!command) {
                    messageApi.warning('请输入命令');
                    return;
                }
                
                setLoading(true);
                try {
                    const fullCommand = command.startsWith('k3s ') ? command : `k3s kubectl ${command}`;
                    let result = await sshExecuteCmd(sessionKey, fullCommand);
                    
                    Modal.info({
                        title: '命令执行结果',
                        content: <pre style={{ whiteSpace: 'pre-wrap' }}>{result.error || result}</pre>,
                        width: '80%'
                    });
                } catch (error) {
                    messageApi.error('执行命令失败: ' + error.message);
                } finally {
                    setLoading(false);
                }
            }
        });
    };
    
    return (
        <div>
            {messageCtxHandler}
            {contextHolder}
            
            {/* 顶部控制栏 */}
            <Card size="small" type="inner" style={{ marginBottom: 15 }}>
                <Space>
                    <span>Namespace:</span>
                    <Select
                        value={currentNamespace}
                        onChange={setCurrentNamespace}
                        style={{ width: 200 }}
                        loading={loading}
                    >
                        {namespaces.map(ns => (
                            <Option key={ns} value={ns}>{ns}</Option>
                        ))}
                    </Select>
                    
                    <span style={{ marginLeft: 20 }}>资源类型:</span>
                    <Select
                        value={selectedResource}
                        onChange={setSelectedResource}
                        style={{ width: 200 }}
                    >
                        {apiResources.map(resource => (
                            <Option key={resource} value={resource}>{resource}</Option>
                        ))}
                    </Select>
                    
                    <Button 
                        type="primary" 
                        icon={<SyncOutlined />} 
                        onClick={refreshResourceData}
                    >
                        刷新
                    </Button>
                    
                    <Button 
                        
                        onClick={executeCustomCommand}
                    >
                        执行命令
                    </Button>
                </Space>
            </Card>
            
            {/* 资源列表表格 */}
            <Table
                dataSource={resourceData}
                columns={resourceColumns}
                size="small"
                bordered={true}
                locale={{
                    emptyText: <Empty description="没有找到资源数据" />
                }}
                pagination={{
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条`
                }}
                rowKey={'name'}
                scroll={{ y: '400px' }}
                loading={loading}
            />
            
            {/* 资源详情模态框 */}
            <Modal
                title={`${selectedResource} 详情: ${resourceDetails?.metadata?.name}`}
                open={showDetailsModal}
                onCancel={() => setShowDetailsModal(false)}
                footer={null}
                width={'80%'}
            >
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {JSON.stringify(resourceDetails, null, 2)}
                </pre>
            </Modal>
            
            {/* 资源YAML模态框 */}
            <Modal
                title={`${selectedResource} YAML: ${resourceDetails?.metadata?.name}`}
                open={showRawYamlModal}
                onCancel={() => setShowRawYamlModal(false)}
                footer={null}
                width={'80%'}
            >
                <Spin spinning={loadingYaml}>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {rawYaml}
                    </pre>
                </Spin>
            </Modal>
        </div>
    );
}