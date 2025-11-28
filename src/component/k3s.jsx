import React, { useEffect, useState } from 'react';
import { Button, Space, Tabs, Modal, Typography, Card, message, Radio, Input } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { sshExecuteCmd } from "../service/invoke"
const { Link } = Typography;
const { TextArea } = Input;

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
        const props = { sessionKey, namespace: currentNamespace, refreshCount };
        
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

            <Space style={{ marginBottom: 15 }}>
                <Radio.Group
                    value={currentNamespace}
                    onChange={(e) => setCurrentNamespace(e.target.value)}
                    disabled={loading}
                    style={{ marginLeft: '8px' }}
                >
                    {namespaces.map(ns => (
                        <Radio.Button key={ns} value={ns}>{ns}</Radio.Button>
                    ))}
                </Radio.Group>
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
            </Space>

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
        </div>
    );
}