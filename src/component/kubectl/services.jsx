import React, { useEffect, useState } from 'react';
import { Button, Space, Table, Typography, message, Modal, Spin, Empty } from 'antd';
import { sshExecuteCmd } from "../../service/invoke";

const { Link } = Typography;

export default function Services({ sessionKey, namespace, refreshCount, searchText }) {
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, messageCtxHandler] = message.useMessage();
    const [loading, setLoading] = useState(false);
    
    // Services specific states
    const [serviceData, setServiceData] = useState([]);
    const [serviceColumns, setServiceColumns] = useState([]);
    const [currentResourceName, setCurrentResourceName] = useState('');
    const [showRawYamlModal, setShowRawYamlModal] = useState(false);
    const [rawYaml, setRawYaml] = useState('');
    const [loadingYaml, setLoadingYaml] = useState(false);
    
    // 当sessionKey、namespace、refreshCount或searchText改变时，重新加载services数据
    useEffect(() => {
        if (sessionKey && namespace) {
            loadServiceData();
        }
    }, [sessionKey, namespace, refreshCount, searchText]);
    
    // 加载services数据
    const loadServiceData = async () => {
        setLoading(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl get services -n ${namespace} -o json`);
            
            if (result.error) {
                messageApi.error(`获取services数据失败: ` + result.error);
                setServiceData([]);
                setServiceColumns([]);
                setLoading(false);
                return;
            }
            
            const data = JSON.parse(result);
            if (data.items && Array.isArray(data.items)) {
                // 处理services数据，提取关键信息
                const items = processServiceItems(data.items);
                // 按照age进行排序（从新到旧）
                items.sort((a, b) => new Date(b.metadata.creationTimestamp) - new Date(a.metadata.creationTimestamp));
                setServiceData(items);
                
                // 生成表格列
                const columns = generateServiceColumns();
                setServiceColumns(columns);
            } else {
                messageApi.warning(`没有找到services的数据`);
                setServiceData([]);
                setServiceColumns([]);
            }
        } catch (error) {
            messageApi.error('处理services数据失败: ' + error.message);
            setServiceData([]);
            setServiceColumns([]);
        } finally {
            setLoading(false);
        }
    };
    
    // 处理services项，提取关键信息
    const processServiceItems = (items) => {
        let processedItems = items.map(item => {
            return {
                name: item.metadata.name,
                namespace: item.metadata.namespace,
                type: item.spec.type,
                clusterIP: item.spec.clusterIP || '-',
                ports: item.spec.ports ? 
                    item.spec.ports.map(p => `${p.port}:${p.targetPort}`).join(', ') : 
                    '-',
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
    
    // 生成services表格列配置
    const generateServiceColumns = () => {
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
                title: '类型',
                dataIndex: 'type',
                key: 'type'
            },
            {
                title: '集群IP',
                dataIndex: 'clusterIP',
                key: 'clusterIP'
            },
            {
                title: '端口',
                dataIndex: 'ports',
                key: 'ports',
                render: (text, record) => (
                    <div style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {text.split(', ').map((p, index) => (
                            <div key={index}>{p}</div>
                        ))}
                    </div>
                )
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
                        <Button size="small" onClick={() => describeResource(record.name)} key="describe">
                            describe
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
    
    // 显示资源的YAML
    const showResourceYaml = async (resourceName) => {
        setCurrentResourceName(resourceName);
        setLoadingYaml(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl get service ${resourceName} -n ${namespace} -o yaml`);
            
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
            title: `确定要删除service ${resourceName}吗？`,
            content: '此操作不可恢复，请谨慎操作。',
            okText: '确定',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    setLoading(true);
                    let result = await sshExecuteCmd(sessionKey, 
                        `k3s kubectl delete service ${resourceName} -n ${namespace}`);
                    
                    if (result.error) {
                        messageApi.error(`删除service失败: ` + result.error);
                    } else {
                        messageApi.success(`删除service成功`);
                        // 重新加载资源数据
                        await loadServiceData();
                    }
                } catch (error) {
                    messageApi.error('处理删除操作失败: ' + error.message);
                } finally {
                    setLoading(false);
                }
            }
        });
    };
    
    // 显示资源详情
    const describeResource = async (resourceName) => {
        try {
            let result = await sshExecuteCmd(sessionKey,
                `k3s kubectl describe service ${resourceName} -n ${namespace}`);
            console.log(result);
            if (result.error) {
                messageApi.error('获取Service状态失败: ' + result.error);
            } else {
                modal.info({
                    title: `${resourceName} 描述`,
                    content: <pre style={{ whiteSpace: 'pre-wrap' }}>{result}</pre>,
                    width: '80%'
                });
            }
        } catch (error) {
            messageApi.error('处理Service状态操作失败: ' + error.message);
        } finally {
            setLoading(false);
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
                    共 {serviceData.length} 个 Service
                </span>
            </Space>
            
            {/* services列表表格 */}
            <Table
                dataSource={serviceData}
                columns={serviceColumns}
                size="small"
                bordered={true}
                locale={{
                    emptyText: <Empty description="没有找到services数据" />
                }}
                loading={loading}
                rowKey='name'
                pagination={false}
            />
            
            {/* 资源YAML模态框 */}
            <Modal
                title={`Service YAML: ${currentResourceName}`}
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