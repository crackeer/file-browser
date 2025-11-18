import React, { use, useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Table, Button, Modal, Form, Space, Radio, Input } from 'antd';
import { getStorageList, createStorage, deleteStorage } from "../service/database";

export const Route = createFileRoute('/')({
    component: Index,
})


function Index() {
    const navigate = useNavigate()
    useEffect(() => {
        console.log(888)
       navigate('/setting')
    }, []);

    return <></>
}