'use client';

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useState,
} from 'react';

export type WorkspaceTreeExpansionState = Readonly<{
  expandedItems: string[];
  knownProjectItems: string[];
}>;

type WorkspaceTreeExpansionContextValue = Readonly<{
  setState: Dispatch<SetStateAction<WorkspaceTreeExpansionState>>;
  state: WorkspaceTreeExpansionState;
}>;

const initialState: WorkspaceTreeExpansionState = {
  expandedItems: [],
  knownProjectItems: [],
};

const WorkspaceTreeExpansionContext = createContext<WorkspaceTreeExpansionContextValue | null>(
  null,
);

export function WorkspaceTreeExpansionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState(initialState);
  return (
    <WorkspaceTreeExpansionContext.Provider value={{ setState, state }}>
      {children}
    </WorkspaceTreeExpansionContext.Provider>
  );
}

export function useWorkspaceTreeExpansion() {
  const context = useContext(WorkspaceTreeExpansionContext);
  const [localState, setLocalState] = useState(initialState);
  return context ?? { setState: setLocalState, state: localState };
}
