import React, { PureComponent } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

const data = [
    {
        $: 270,
    },
    {
        $: 200,
    },
    {
        $: 290,
    },
    {
        $: 300,
    },
    {
        $: 350,
    },
    {
        $: 375,
    },
    {
        $: 380,
    },
    {
        $: 390,
    },
    {
        $: 400,
    },
    {
        $: 420,
    },
    {
        $: 300,
    },
    {
        $: 400,
    },
    {
        $: 410,
    },
    {
        $: 415,
    },
    {
        $: 420,
    },
];

export default class Example extends PureComponent {
    render() {
        return (
            <ResponsiveContainer width="100%" height="85%">
                <LineChart width={500} height={300} data={data}>
                    <Tooltip
                        separator=""
                        cursor={false}
                        labelFormatter={() => ""}
                    />
                    <Line
                        type="linear"
                        dataKey="$"
                        stroke="black"
                        dot={false}
                        strokeWidth={2}
                    />
                </LineChart>
            </ResponsiveContainer>
        );
    }
}