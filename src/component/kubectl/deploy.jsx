import React, { useEffect, useState } from 'react';
import { Button, Space, Table, Typography, Card, message, Modal, Spin, Dropdown, Empty } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { sshExecuteCmd } from "../../service/invoke"
const { Link } = Typography;

export default function Deploy({ sessionKey, namespace, refreshCount }) {
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, messageCtxHandler] = message.useMessage();
    const [loading, setLoading] = useState(false);

    // Deploy specific states
    const [deployData, setDeployData] = useState([]);
    const [deployColumns, setDeployColumns] = useState([]);
    const [resourceDetails, setResourceDetails] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showRawYamlModal, setShowRawYamlModal] = useState(false);
    const [rawYaml, setRawYaml] = useState('');
    const [loadingYaml, setLoadingYaml] = useState(false);

    // 当sessionKey、namespace或refreshCount改变时，重新加载deployments数据
    useEffect(() => {
        if (sessionKey && namespace) {
            loadDeployData();
        }
    }, [sessionKey, namespace, refreshCount]);

    // 加载deployments数据
    const loadDeployData = async () => {
        setLoading(true);
        try {
            let result = await sshExecuteCmd(sessionKey,
                `k3s kubectl get deployments -n ${namespace} -o json`);

            if (result.error) {
                messageApi.error(`获取deployments数据失败: ` + result.error);
                setDeployData([]);
                setDeployColumns([]);
                setLoading(false);
                return;
            }

            const data = JSON.parse(result);
            if (data.items && Array.isArray(data.items)) {
                // 处理deployments数据，提取关键信息
                const items = processDeployItems(data.items);
                console.log(items);
                // 按照age进行排序（从新到旧）
                items.sort((a, b) => new Date(b.metadata.creationTimestamp) - new Date(a.metadata.creationTimestamp));
                setDeployData(items);

                // 生成表格列
                const columns = generateDeployColumns();
                setDeployColumns(columns);
            } else {
                messageApi.warning(`没有找到deployments的数据`);
                setDeployData([]);
                setDeployColumns([]);
            }
        } catch (error) {
            messageApi.error('处理deployments数据失败: ' + error.message);
            setDeployData([]);
            setDeployColumns([]);
        } finally {
            setLoading(false);
        }
    };

    // 处理deployments项，提取关键信息
    const processDeployItems = (items) => {
        return items.map(item => {
            return {
                name: item.metadata.name,
                namespace: item.metadata.namespace,
                ready: item.status.readyReplicas + '/' + item.status.replicas,
                upToDate: item.status.updatedReplicas || 0,
                available: item.status.availableReplicas || 0,
                age: calculateAge(item.metadata.creationTimestamp),
                metadata: item.metadata, // 保存metadata用于排序
                _raw: item // 保存原始数据用于查看详情
            };
        });
    };

    // 生成deployments表格列配置
    const generateDeployColumns = () => {
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
                title: '就绪',
                dataIndex: 'ready',
                key: 'ready'
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
                        </Button>,
                        <Button
                            size="small"
                            onClick={() => rolloutRestart(record.name)}
                            key="details"
                        >
                            滚动更新
                        </Button>,
                        <Button
                            size="small"
                            onClick={() => rolloutHistory(record.name)}
                            key="history"
                        >
                            滚动历史
                        </Button>,
                        <Button
                            size="small"
                            onClick={() => describeResource(record.name)}
                            key="status"
                        >
                            describe
                        </Button>,
                    ];

                    return <Space>{actions}</Space>;
                }
            }
        ];
    };

    // 显示资源的YAML
    const showResourceYaml = async (resource) => {
        setLoadingYaml(true);
        let resourceName = resource.name;
        setResourceDetails(resource);
        try {
            let result = await sshExecuteCmd(sessionKey,
                `k3s kubectl get deployment ${resourceName} -n ${namespace} -o yaml`);

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
            title: `确定要删除deployment ${resourceName}吗？`,
            content: '此操作不可恢复，请谨慎操作。',
            okText: '确定',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    setLoading(true);
                    let result = await sshExecuteCmd(sessionKey,
                        `k3s kubectl delete deployment ${resourceName} -n ${namespace}`);

                    if (result.error) {
                        messageApi.error(`删除deployment失败: ` + result.error);
                    } else {
                        messageApi.success(`删除deployment成功`);
                        // 重新加载资源数据
                        await loadDeployData();
                    }
                } catch (error) {
                    messageApi.error('处理删除操作失败: ' + error.message);
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    // 滚动更新-重启
    const rolloutRestart = async (resourceName) => {
        modal.confirm({
            title: `确定要重启deployment ${resourceName}吗？`,
            content: '此操作会重启所有Pod，可能会导致服务中断。',
            okText: '确定',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    setLoading(true);
                    let result = await sshExecuteCmd(sessionKey,
                        `k3s kubectl rollout restart deployment ${resourceName} -n ${namespace}`);

                    if (result.error) {
                        messageApi.error('重启部署失败: ' + result.error);
                    } else {
                        messageApi.success('重启部署成功');
                        // 重新加载资源数据
                        await loadDeployData();
                    }
                } catch (error) {
                    messageApi.error('处理重启操作失败: ' + error.message);
                } finally {
                    setLoading(false);
                }
            }
        })
    };

    // 滚动更新-历史
    const rolloutHistory = async (resourceName) => {
        try {
            setLoading(true);
            let result = await sshExecuteCmd(sessionKey,
                `k3s kubectl rollout history deployment ${resourceName} -n ${namespace}`);


            if (result.error) {
                messageApi.error('获取部署历史失败: ' + result.error);
            } else {
                modal.info({
                    title: `${resourceName} 部署历史`,
                    content: <pre style={{ whiteSpace: 'pre-wrap' }}>{result}</pre>,
                    width: '80%'
                });
            }
        } catch (error) {
            messageApi.error('处理部署历史操作失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // 滚动更新-状态
    const describeResource = async (resourceName) => {
        try {
            setLoading(true);
            let result = await sshExecuteCmd(sessionKey,
                `k3s kubectl describe deployment ${resourceName} -n ${namespace}`);

            if (result.error) {
                messageApi.error('获取部署状态失败: ' + result.error);
            } else {
                modal.info({
                    title: `${resourceName} 描述`,
                    content: <pre style={{ whiteSpace: 'pre-wrap' }}>{result}</pre>,
                    width: '80%'
                });
            }
        } catch (error) {
            messageApi.error('处理部署状态操作失败: ' + error.message);
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



    const rolloutAll = async () => {
        // 确认是否要滚动更新所有deployment
        modal.confirm({
            title: `确定要滚动更新所有deployment吗？`,
            content: '此操作将重启所有deployment，是否继续？',
            okText: '确定',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    setLoading(true);
                    let result = await sshExecuteCmd(sessionKey,
                        `k3s kubectl rollout status deployment -n ${namespace}`);

                    if (result.error) {
                        messageApi.error('获取滚动更新状态失败: ' + result.error);
                    } else {
                        modal.info({
                            title: `滚动更新状态`,
                            content: <pre style={{ whiteSpace: 'pre-wrap' }}>{result}</pre>,
                            width: '80%'
                        });
                    }
                } catch (error) {
                    messageApi.error('处理滚动更新状态操作失败: ' + error.message);
                } finally {
                    setLoading(false);
                }
            }
        })

    }

    return (
        <div>
            {messageCtxHandler}
            {contextHolder}

            <Space style={{ marginBottom: 15 }}>
                <span style={{ marginBottom: 10, color: '#666', fontSize: '14px' }}>
                    共 {deployData.length} 个 Deployment
                </span>
                <Button
                    type="primary"
                    onClick={() => rolloutAll()}
                >
                    滚动更新所有
                </Button>
            </Space>


            {/* deployments列表表格 */}
            <Table
                dataSource={deployData}
                columns={deployColumns}
                size="small"
                bordered={true}
                locale={{
                    emptyText: <Empty description="没有找到deployments数据" />
                }}
                pagination={false}
                rowKey={'name'}
                loading={loading}
            />

            {/* 资源YAML模态框 */}
            <Modal
                title={`Deployment YAML: ${resourceDetails?.name}`}
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
