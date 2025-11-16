import {useEffect, useState} from 'react';
import { createRootRoute, Link, Outlet,useNavigate } from '@tanstack/react-router'
import { getLastRoute } from '../store/router';
import { Layout, Menu } from "antd";
import lodash from 'lodash'
const { Header, Content } = Layout;

const headerStyle = {
    textAlign: 'center',
    height: 40,
    lineHeight: '40px',
    padding: 0,
};

function Root(props) {
    const navigate = useNavigate();
    const [path, setPath] = useState([])
    useEffect(() => {
        let last = getLastRoute();
        if (last) {
            navigate(last);
            setPath([lodash.trimStart(last, '/')])
        }
    }, [])

    const clickMenu = (e) => {
       setPath([e.key])
    }
    return <Layout>
        <Header style={headerStyle}>
            <Menu mode="horizontal" items={[
                { key: 'setting', label: <Link to="/setting">配置</Link> },
                { key: 'ssh', label: <Link to="/ssh">SSH</Link> },
            ]} selectedKeys={path} onClick={clickMenu}/>;
        </Header>
        <Content>
            <Outlet />
        </Content>
    </Layout>
}

export const Route = createRootRoute({
    component: Root,
})
