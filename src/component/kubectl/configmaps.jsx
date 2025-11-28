import React, { useEffect, useState } from 'react';
import { Button, Space, Table, Typography, Card, message, Modal, Spin, Empty, Tag } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { sshExecuteCmd } from "../../service/invoke"
const { Link } = Typography;

export default function ConfigMaps({ sessionKey, namespace, refreshCount }) {
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, messageCtxHandler] = message.useMessage();
    const [loading, setLoading] = useState(false);
    
    // ConfigMaps specific states
    const [configmapData, setConfigmapData] = useState([]);
    const [configmapColumns, setConfigmapColumns] = useState([]);
    const [showRawYamlModal, setShowRawYamlModal] = useState(false);
    const [rawYaml, setRawYaml] = useState('');
    const [loadingYaml, setLoadingYaml] = useState(false);
    const [currentResourceName, setCurrentResourceName] = useState('');
    
    // 当sessionKey、namespace或refreshCount改变时，重新加载configmaps数据
    useEffect(() => {
        if (sessionKey && namespace) {
            loadConfigMapData();
        }
    }, [sessionKey, namespace, refreshCount]);
    
    // 加载configmaps数据
    const loadConfigMapData = async () => {
        setLoading(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl get configmaps -n ${namespace} -o json`);
            
            if (result.error) {
                messageApi.error(`获取configmaps数据失败: ` + result.error);
                setConfigmapData([]);
                setConfigmapColumns([]);
                setLoading(false);
                return;
            }
            
            const data = JSON.parse(result);
            if (data.items && Array.isArray(data.items)) {
                // 处理configmaps数据，提取关键信息
                const items = processConfigmapItems(data.items);
                // 按照age进行排序（从新到旧）
                items.sort((a, b) => new Date(b.metadata.creationTimestamp) - new Date(a.metadata.creationTimestamp));
                setConfigmapData(items);
                
                // 生成表格列
                const columns = generateConfigmapColumns();
                setConfigmapColumns(columns);
            } else {
                messageApi.warning(`没有找到configmaps的数据`);
                setConfigmapData([]);
                setConfigmapColumns([]);
            }
        } catch (error) {
            messageApi.error('处理configmaps数据失败: ' + error.message);
            setConfigmapData([]);
            setConfigmapColumns([]);
        } finally {
            setLoading(false);
        }
    };
    
    // 处理configmaps数据，提取关键信息
    const processConfigmapItems = (items) => {
        return items.map(item => {
            // 计算数据大小
            const dataSize = item.data ? 
                new Blob([JSON.stringify(item.data)]).size : 0;
            
            // 获取数据键的数量
            const dataKeysCount = item.data ? Object.keys(item.data).length : 0;
            
            // 获取数据键名列表
            const dataKeys = item.data ? 
                Object.keys(item.data).slice(0, 3).join(', ') + 
                (dataKeysCount > 3 ? `... 等${dataKeysCount}个键` : '') : 
                '无数据';
            
            // 检查是否有二进制数据
            const hasBinaryData = item.binaryData && Object.keys(item.binaryData).length > 0;
            
            return {
                name: item.metadata.name,
                namespace: item.metadata.namespace,
                dataKeys: dataKeys,
                dataKeysCount: dataKeysCount,
                dataSize: formatBytes(dataSize),
                hasBinaryData: hasBinaryData,
                age: calculateAge(item.metadata.creationTimestamp),
                metadata: item.metadata, // 保存metadata用于排序
                _raw: item // 保存原始数据用于查看详情
            };
        });
    };
    
    // 格式化字节大小
    const formatBytes = (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };
    
    // 生成configmaps表格列配置
    const generateConfigmapColumns = () => {
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
                title: '数据键',
                dataIndex: 'dataKeys',
                key: 'dataKeys',
                ellipsis: true,
                width: 300
            },
            {
                title: '数据键数量',
                dataIndex: 'dataKeysCount',
                key: 'dataKeysCount',
                width: 120,
                align: 'center'
            },
            {
                title: '数据大小',
                dataIndex: 'dataSize',
                key: 'dataSize',
                width: 100,
                align: 'center'
            },
            {
                title: '二进制数据',
                key: 'hasBinaryData',
                width: 100,
                align: 'center',
                render: (_, record) => (
                    record.hasBinaryData ? (
                        <Tag color="blue">是</Tag>
                    ) : (
                        <Tag color="default">否</Tag>
                    )
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
                `k3s kubectl get configmap ${resourceName} -n ${namespace} -o yaml`);
            
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
            title: `确定要删除configmap ${resourceName}吗？`,
            content: '此操作不可恢复，请谨慎操作。',
            okText: '确定',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    setLoading(true);
                    let result = await sshExecuteCmd(sessionKey, 
                        `k3s kubectl delete configmap ${resourceName} -n ${namespace}`);
                    
                    if (result.error) {
                        messageApi.error(`删除configmap失败: ` + result.error);
                    } else {
                        messageApi.success(`删除configmap成功`);
                        // 重新加载资源数据
                        await loadConfigmapData();
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
                    共 {configmapData.length} 个 ConfigMap
                </span>
            </Space>
            
            {/* configmaps列表表格 */}
            <Table
                dataSource={configmapData}
                columns={configmapColumns}
                size="small"
                bordered={true}
                locale={{
                    emptyText: <Empty description="没有找到configmaps数据" />
                }}
                pagination={false}
                rowKey={'name'}
                scroll={{ y: '400px' }}
                loading={loading}
            />
            

            
            {/* 资源YAML模态框 */}
            <Modal
                title={`ConfigMap YAML: ${currentResourceName}`}
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
