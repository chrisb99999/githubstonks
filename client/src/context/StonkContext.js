import React, { createContext, useState, useEffect } from "react";

export const StonkContext = createContext();

export const StonkProvider = ({ children }) => {
    const [stonkData, setstonkData] = useState([]);
    const [refetch, setRefetch] = useState(false);
    useEffect(() => {
        fetch("https://api.githubstonks.com/api/stonkData")
            .then((response) => response.json())
            .then(({ data }) => {
                setstonkData(data);
                setRefetch(false);
            });
    }, [refetch]);
    return (
        <StonkContext.Provider value={{ stonkData, setRefetch }}>
            {children}
        </StonkContext.Provider>
    );
};
