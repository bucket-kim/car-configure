import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type FC, type ReactNode, useState } from 'react'

interface QueryProviderProps {
    children: ReactNode
}

const QueryProvider: FC<QueryProviderProps> = ({
    children
}) => {

    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30 * 1000, //data stays fresh for 30 seconds
                refetchInterval: 60 * 1000, // auto refetch every 60 seconds
            }
        }
    }))

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    )
}

export default QueryProvider;
