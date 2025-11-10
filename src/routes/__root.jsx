import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Layout, Menu } from "antd";
import { CloudServerOutlined, MailOutlined, SettingOutlined } from '@ant-design/icons';
const { Header, Footer, Content } = Layout;

const headerStyle = {
    textAlign: 'center',
    height: 40,
    lineHeight: '40px',
    padding: 0,
};
export const Route = createRootRoute({
    component: () => (
        <>
            <Layout>
                <Header style={headerStyle}>
                    <Menu mode="horizontal" items={[
                        { key: 'mail', icon: <CloudServerOutlined />, label: <Link to="/">SSH</Link> },
                        { key: 'setting', label: <Link to="/setting">配置</Link> },
                    ]} />;
                </Header>
                <Content>
                    <Outlet />
                </Content>
            </Layout>
        </>
    ),
})