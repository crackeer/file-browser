import React, { useEffect, useState } from 'react';
import { Button, Space, Table, Typography, Card, message, Modal, Spin, Dropdown, Empty } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { sshExecuteCmd } from "../../service/invoke"
const { Link } = Typography;

export default function Pods({ sessionKey, namespace, refreshCount, searchText }) {
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, messageCtxHandler] = message.useMessage();
    const [loading, setLoading] = useState(false);
    
    // Pods specific states
    const [podData, setPodData] = useState([]);
    const [podColumns, setPodColumns] = useState([]);
    const [resourceDetails, setResourceDetails] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showRawYamlModal, setShowRawYamlModal] = useState(false);
    const [rawYaml, setRawYaml] = useState('');
    const [loadingYaml, setLoadingYaml] = useState(false);
    
    // 当sessionKey、namespace、refreshCount或searchText改变时，重新加载pods数据
    useEffect(() => {
        if (sessionKey && namespace) {
            loadPodData();
        }
    }, [sessionKey, namespace, refreshCount, searchText]);
    
    // 加载pods数据
    const loadPodData = async () => {
        setLoading(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl get pods -n ${namespace} -o json`);
            
            if (result.error) {
                messageApi.error(`获取pods数据失败: ` + result.error);
                setPodData([]);
                setPodColumns([]);
                setLoading(false);
                return;
            }
            
            const data = JSON.parse(result);
            if (data.items && Array.isArray(data.items)) {
                // 处理pods数据，提取关键信息
                const items = processPodItems(data.items);
                // 按照age进行排序（从新到旧）
                items.sort((a, b) => new Date(b.metadata.creationTimestamp) - new Date(a.metadata.creationTimestamp));
                setPodData(items);
                
                // 生成表格列
                const columns = generatePodColumns();
                setPodColumns(columns);
            } else {
                messageApi.warning(`没有找到pods的数据`);
                setPodData([]);
                setPodColumns([]);
            }
        } catch (error) {
            messageApi.error('处理pods数据失败: ' + error.message);
            setPodData([]);
            setPodColumns([]);
        } finally {
            setLoading(false);
        }
    };
    
    // 处理pods项，提取关键信息
    const processPodItems = (items) => {
        let processedItems = items.map(item => {
            return {
                name: item.metadata.name,
                namespace: item.metadata.namespace,
                status: item.status.phase,
                ready: item.status.containerStatuses ? 
                    item.status.containerStatuses.filter(c => c.ready).length + '/' + item.status.containerStatuses.length : 
                    '0/0',
                restarts: item.status.containerStatuses ? 
                    item.status.containerStatuses.reduce((sum, c) => sum + (c.restartCount || 0), 0) : 
                    0,
                node: item.spec.nodeName || '-',
                age: calculateAge(item.metadata.creationTimestamp),
                metadata: item.metadata, // 保存metadata用于排序
                _raw: item // 保存原始数据用于查看详情
            };
        });
        
        // 如果有搜索文本，进行过滤
        if (searchText) {
            processedItems = processedItems.filter(item => 
                item.name.toLowerCase().includes(searchText.toLowerCase())
            );
        }
        
        return processedItems;
    };
    
    // 生成pods表格列配置
    const generatePodColumns = () => {
        return [
            {
                title: '名称',
                dataIndex: 'name',
                key: 'name',
                render: (text, record) => (
                    <a href="javascript:void(0)" onClick={() => showResourceYaml(record)}>
                        {text}
                    </a>
                )
            },
            {
                title: '状态',
                dataIndex: 'status',
                key: 'status'
            },
            {
                title: '就绪',
                dataIndex: 'ready',
                key: 'ready'
            },
            {
                title: '重启次数',
                dataIndex: 'restarts',
                key: 'restarts'
            },
            {
                title: '节点',
                dataIndex: 'node',
                key: 'node'
            },
            {
                title: '创建时间',
                dataIndex: 'age',
                key: 'age'
            },
            {
                title: '操作',
                key: 'actions',
                render: (_, record) => {
                    const actions = [
                        <Button 
                            size="small" 
                            onClick={() => describeResource(record)} 
                            key="describe"
                        >
                            描述
                        </Button>,
                        <Button 
                            size="small" 
                            danger 
                            onClick={() => deleteResource(record.name)} 
                            key="delete"
                        >
                            删除
                        </Button>
                    ];
                    
                    return <Space>{actions}</Space>;
                }
            }
        ];
    };
    
    // 显示资源详情
    const showResourceDetails = (record) => {
        setResourceDetails(record._raw);
        setShowDetailsModal(true);
    };
    
    // 显示资源的YAML
    const showResourceYaml = async (resource) => {
        setLoadingYaml(true);
        setResourceDetails(resource);
        let resourceName = resource.name;
        try {
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl get pod ${resourceName} -n ${namespace} -o yaml`);
            
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
    
    // 删除资源
    const deleteResource = async (resourceName) => {
        modal.confirm({
            title: `确定要删除pod ${resourceName}吗？`,
            content: '此操作不可恢复，请谨慎操作。',
            okText: '确定',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    setLoading(true);
                    let result = await sshExecuteCmd(sessionKey, 
                        `k3s kubectl delete pod ${resourceName} -n ${namespace}`);
                    
                    if (result.error) {
                        messageApi.error(`删除pod失败: ` + result.error);
                    } else {
                        messageApi.success(`删除pod成功`);
                        // 重新加载资源数据
                        await loadPodData();
                    }
                } catch (error) {
                    messageApi.error('处理删除操作失败: ' + error.message);
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    const describeResource = async (resource) => {
        setLoadingYaml(true);
        setResourceDetails(resource);
        let resourceName = resource.name;
        try {
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl describe pod ${resourceName} -n ${namespace}`);
            
            if (result.error) {
                messageApi.error('获取描述信息失败: ' + result.error);
                return;
            }
            
            setRawYaml(result);
            setShowRawYamlModal(true);
        } catch (error) {
            messageApi.error('处理描述信息数据失败: ' + error.message);
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
    

    
    return (
        <div>
            {messageCtxHandler}
            {contextHolder}
            
            <Space style={{ marginBottom: 15 }}>
                <span style={{ marginBottom: 10, color: '#666', fontSize: '14px' }}>
                    共 {podData.length} 个 Pod
                </span>
            </Space>
            
            {/* pods列表表格 */}
            <Table
                dataSource={podData}
                columns={podColumns}
                size="small"
                bordered={true}
                locale={{
                    emptyText: <Empty description="没有找到pods数据" />
                }}
                pagination={false}
                rowKey={'name'}
                loading={loading}
            />
            
            
            {/* 资源YAML模态框 */}
            <Modal
                title={`Pod YAML: ${resourceDetails?.name}`}
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
