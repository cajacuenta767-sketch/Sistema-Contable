'use client'

import { Pagination } from '@/components/ui/Pagination'
import { useFilters } from './FilterBar'

/** Une la paginacion presentacional con el estado en la URL. */
export function TablePagination(props: {
  page: number
  totalPages: number
  total: number
  pageSize: number
}) {
  const { setParam } = useFilters()
  return <Pagination {...props} onChange={(page) => setParam('page', String(page))} />
}
