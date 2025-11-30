import React, { useEffect, useState } from 'react';
import { Button, Space, Table, Typography, Card, message, Modal, Spin, Dropdown, Empty } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { sshExecuteCmd } from "../../service/invoke"
const { Link } = Typography;

export default function StatefulSets({ sessionKey, namespace, refreshCount, searchText }) {
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, messageCtxHandler] = message.useMessage();
    const [loading, setLoading] = useState(false);
    
    // StatefulSets specific states
    const [statefulsetData, setStatefulsetData] = useState([]);
    const [statefulsetColumns, setStatefulsetColumns] = useState([]);
    const [showRawYamlModal, setShowRawYamlModal] = useState(false);
    const [rawYaml, setRawYaml] = useState('');
    const [loadingYaml, setLoadingYaml] = useState(false);
    const [currentResourceName, setCurrentResourceName] = useState('');
    
    // 当sessionKey、namespace、refreshCount或searchText改变时，重新加载statefulsets数据
    useEffect(() => {
        if (sessionKey && namespace) {
            loadStatefulSetData();
        }
    }, [sessionKey, namespace, refreshCount, searchText]);
    
    // 加载statefulsets数据
    const loadStatefulSetData = async () => {
        setLoading(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl get statefulsets -n ${namespace} -o json`);
            
            if (result.error) {
                messageApi.error(`获取statefulsets数据失败: ` + result.error);
                setStatefulsetData([]);
                setStatefulsetColumns([]);
                setLoading(false);
                return;
            }
            
            const data = JSON.parse(result);
            if (data.items && Array.isArray(data.items)) {
                // 处理statefulsets数据，提取关键信息
                const items = processStatefulsetItems(data.items);
                // 按照age进行排序（从新到旧）
                items.sort((a, b) => new Date(b.metadata.creationTimestamp) - new Date(a.metadata.creationTimestamp));
                setStatefulsetData(items);
                
                // 生成表格列
                const columns = generateStatefulsetColumns();
                setStatefulsetColumns(columns);
            } else {
                messageApi.warning(`没有找到statefulsets的数据`);
                setStatefulsetData([]);
                setStatefulsetColumns([]);
            }
        } catch (error) {
            messageApi.error('处理statefulsets数据失败: ' + error.message);
            setStatefulsetData([]);
            setStatefulsetColumns([]);
        } finally {
            setLoading(false);
        }
    };
    
    // 处理statefulsets项，提取关键信息
    const processStatefulsetItems = (items) => {
        let processedItems = items.map(item => {
            return {
                name: item.metadata.name,
                namespace: item.metadata.namespace,
                ready: item.status.readyReplicas || 0 + '/' + (item.status.replicas || 0),
                upToDate: item.status.updatedReplicas || 0,
                available: item.status.availableReplicas || 0,
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
    
    // 生成statefulsets表格列配置
    const generateStatefulsetColumns = () => {
        return [
            {
                title: '名称',
                dataIndex: 'name',
                key: 'name',
                render: (text, record) => (
                    <a href="javascript:void(0)" onClick={() => showResourceYaml(record.name)}>
                        {text}
                    </a>
                )
            },
            {
                title: '就绪',
                dataIndex: 'ready',
                key: 'ready'
            },
            {
                title: '最新',
                dataIndex: 'upToDate',
                key: 'upToDate'
            },
            {
                title: '可用',
                dataIndex: 'available',
                key: 'available'
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
    

    
    // 显示资源的YAML
    const showResourceYaml = async (resourceName) => {
        setCurrentResourceName(resourceName);
        setLoadingYaml(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl get statefulset ${resourceName} -n ${namespace} -o yaml`);
            
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
        Modal.confirm({
            title: `确定要删除statefulset ${resourceName}吗？`,
            content: '此操作不可恢复，请谨慎操作。',
            okText: '确定',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    setLoading(true);
                    let result = await sshExecuteCmd(sessionKey, 
                        `k3s kubectl delete statefulset ${resourceName} -n ${namespace}`);
                    
                    if (result.error) {
                        messageApi.error(`删除statefulset失败: ` + result.error);
                    } else {
                        messageApi.success(`删除statefulset成功`);
                        // 重新加载资源数据
                        await loadStatefulsetData();
                    }
                } catch (error) {
                    messageApi.error('处理删除操作失败: ' + error.message);
                } finally {
                    setLoading(false);
                }
            }
        });
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
                    共 {statefulsetData.length} 个 StatefulSet
                </span>
            </Space>
            
            {/* statefulsets列表表格 */}
            <Table
                dataSource={statefulsetData}
                columns={statefulsetColumns}
                size="small"
                bordered={true}
                locale={{
                    emptyText: <Empty description="没有找到statefulsets数据" />
                }}
                pagination={false}
                rowKey={'name'}
                scroll={{ y: '400px' }}
                loading={loading}
            />
            

            
            {/* 资源YAML模态框 */}
            <Modal
                title={`StatefulSet YAML: ${currentResourceName}`}
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
