import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Layout, Menu } from "antd";
import { AppstoreOutlined, MailOutlined, SettingOutlined } from '@ant-design/icons';
const { Header, Footer, Content } = Layout;

const headerStyle = {
  textAlign: 'center',
  height: 40,
  lineHeight: '40px',
  backgroundColor: 'transparent',
};
export const Route = createRootRoute({
  component: () => (
    <>
    <Layout>
      <Header style={headerStyle}>
        <Menu  mode="horizontal" items={[
          { key: 'mail', icon: <MailOutlined />, label: <Link to="/">Home</Link> },
          { key: 'app', icon: <AppstoreOutlined />, label: <Link to="/about">About</Link> },
        ]} />;
      </Header>
      <Content>
         <Outlet />
         <TanStackRouterDevtools />
      </Content>
    </Layout>
     
      
    </>
  ),
})