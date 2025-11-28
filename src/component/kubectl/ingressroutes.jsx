import React, { useEffect, useState } from 'react';
import { Button, Space, Table, Typography, Card, message, Modal, Spin, Empty } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { sshExecuteCmd } from "../../service/invoke"
const { Link } = Typography;

export default function IngressRoutes({ sessionKey, namespace, refreshCount }) {
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, messageCtxHandler] = message.useMessage();
    const [loading, setLoading] = useState(false);
    
    // IngressRoutes specific states
    const [ingressrouteData, setIngressrouteData] = useState([]);
    const [ingressrouteColumns, setIngressrouteColumns] = useState([]);
    const [showRawYamlModal, setShowRawYamlModal] = useState(false);
    const [rawYaml, setRawYaml] = useState('');
    const [loadingYaml, setLoadingYaml] = useState(false);
    const [currentResourceName, setCurrentResourceName] = useState('');
    
    // 当sessionKey、namespace或refreshCount改变时，重新加载ingressroutes数据
    useEffect(() => {
        if (sessionKey && namespace) {
            loadIngressRouteData();
        }
    }, [sessionKey, namespace, refreshCount]);
    
    // 加载ingressroutes数据
    const loadIngressRouteData = async () => {
        setLoading(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl get ingressroutes -n ${namespace} -o json`);
            
            if (result.error) {
                messageApi.error(`获取ingressroutes数据失败: ` + result.error);
                setIngressrouteData([]);
                setIngressrouteColumns([]);
                setLoading(false);
                return;
            }
            
            const data = JSON.parse(result);
            if (data.items && Array.isArray(data.items)) {
                // 处理ingressroutes数据，提取关键信息
                const items = processIngressrouteItems(data.items);
                // 按照age进行排序（从新到旧）
                items.sort((a, b) => new Date(b.metadata.creationTimestamp) - new Date(a.metadata.creationTimestamp));
                setIngressrouteData(items);
                
                // 生成表格列
                const columns = generateIngressrouteColumns();
                setIngressrouteColumns(columns);
            } else {
                messageApi.warning(`没有找到ingressroutes的数据`);
                setIngressrouteData([]);
                setIngressrouteColumns([]);
            }
        } catch (error) {
            messageApi.error('处理ingressroutes数据失败: ' + error.message);
            setIngressrouteData([]);
            setIngressrouteColumns([]);
        } finally {
            setLoading(false);
        }
    };
    
    // 处理ingressroutes数据，提取关键信息
    const processIngressrouteItems = (items) => {
        return items.map(item => {
            // 提取规则信息
            const rules = item.spec.routes ? 
                item.spec.routes.map(route => {
                    const match = route.match || '';
                    const kind = route.kind || '';
                    return `${match} (${kind})`;
                }).join(', ') : 
                '无规则';
            
            // 提取服务信息
            const services = item.spec.routes ? 
                item.spec.routes
                    .filter(route => route.services && route.services.length > 0)
                    .flatMap(route => route.services)
                    .map(service => `${service.name}:${service.port}`)
                    .join(', ') : 
                '无服务';
            
            return {
                name: item.metadata.name,
                namespace: item.metadata.namespace,
                rules: rules,
                services: services,
                entryPoints: item.spec.entryPoints ? item.spec.entryPoints.join(', ') : '无入口点',
                tls: item.spec.tls ? '已配置' : '未配置',
                age: calculateAge(item.metadata.creationTimestamp),
                metadata: item.metadata, // 保存metadata用于排序
                _raw: item // 保存原始数据用于查看详情
            };
        });
    };
    
    // 生成ingressroutes表格列配置
    const generateIngressrouteColumns = () => {
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
                title: '规则',
                dataIndex: 'rules',
                key: 'rules',
                ellipsis: true,
                width: 300
            },
            {
                title: '服务',
                dataIndex: 'services',
                key: 'services',
                ellipsis: true,
                width: 200
            },
            {
                title: '入口点',
                dataIndex: 'entryPoints',
                key: 'entryPoints',
                ellipsis: true,
                width: 150
            },
            {
                title: 'TLS',
                dataIndex: 'tls',
                key: 'tls',
                width: 80
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
                `k3s kubectl get ingressroute ${resourceName} -n ${namespace} -o yaml`);
            
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
            title: `确定要删除ingressroute ${resourceName}吗？`,
            content: '此操作不可恢复，请谨慎操作。',
            okText: '确定',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    setLoading(true);
                    let result = await sshExecuteCmd(sessionKey, 
                        `k3s kubectl delete ingressroute ${resourceName} -n ${namespace}`);
                    
                    if (result.error) {
                        messageApi.error(`删除ingressroute失败: ` + result.error);
                    } else {
                        messageApi.success(`删除ingressroute成功`);
                        // 重新加载资源数据
                        await loadIngressrouteData();
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
                    共 {ingressrouteData.length} 个 IngressRoute
                </span>
            </Space>
            
            {/* ingressroutes列表表格 */}
            <Table
                dataSource={ingressrouteData}
                columns={ingressrouteColumns}
                size="small"
                bordered={true}
                locale={{
                    emptyText: <Empty description="没有找到ingressroutes数据" />
                }}
                pagination={false}
                rowKey={'name'}
                scroll={{ y: '400px' }}
                loading={loading}
            />
            

            
            {/* 资源YAML模态框 */}
            <Modal
                title={`IngressRoute YAML: ${currentResourceName}`}
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
