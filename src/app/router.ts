import { createBrowserRouter } from 'react-router'
import { appRoutes } from './routes'

export const createAppRouter = () => createBrowserRouter(appRoutes)
