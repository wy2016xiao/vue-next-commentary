import {
  h,
  provide,
  inject,
  InjectionKey,
  ref,
  nextTick,
  Ref,
  readonly,
  reactive
} from '../src/index'
import { render, nodeOps, serialize } from '@vue/runtime-test'
import { mockWarn } from '@vue/shared'

// reference: https://vue-composition-api-rfc.netlify.com/api.html#provide-inject

describe('api: provide/inject', () => {
  mockWarn()

  it('string keys', () => {
    const Provider = {
      setup() {
        provide('foo', 1)
        return () => h(Middle)
      }
    }

    const Middle = {
      render: () => h(Consumer)
    }

    const Consumer = {
      setup() {
        const foo = inject('foo')
        return () => foo
      }
    }

    const root = nodeOps.createElement('div')
    render(h(Provider), root)
    expect(serialize(root)).toBe(`<div>1</div>`)
  })

  it('symbol keys', () => {
    // also verifies InjectionKey type sync
    const key: InjectionKey<number> = Symbol()

    const Provider = {
      setup() {
        provide(key, 1)
        return () => h(Middle)
      }
    }

    const Middle = {
      render: () => h(Consumer)
    }

    const Consumer = {
      setup() {
        const foo = inject(key) || 1
        return () => foo + 1
      }
    }

    const root = nodeOps.createElement('div')
    render(h(Provider), root)
    expect(serialize(root)).toBe(`<div>2</div>`)
  })

  it('default values', () => {
    const Provider = {
      setup() {
        provide('foo', 'foo')
        return () => h(Middle)
      }
    }

    const Middle = {
      render: () => h(Consumer)
    }

    const Consumer = {
      setup() {
        // default value should be ignored if value is provided
        const foo = inject('foo', 'fooDefault')
        // default value should be used if value is not provided
        const bar = inject('bar', 'bar')
        return () => foo + bar
      }
    }

    const root = nodeOps.createElement('div')
    render(h(Provider), root)
    expect(serialize(root)).toBe(`<div>foobar</div>`)
  })

  it('nested providers', () => {
    const ProviderOne = {
      setup() {
        provide('foo', 'foo')
        provide('bar', 'bar')
        return () => h(ProviderTwo)
      }
    }

    const ProviderTwo = {
      setup() {
        // override parent value
        provide('foo', 'fooOverride')
        provide('baz', 'baz')
        return () => h(Consumer)
      }
    }

    const Consumer = {
      setup() {
        const foo = inject('foo')
        const bar = inject('bar')
        const baz = inject('baz')
        return () => [foo, bar, baz].join(',')
      }
    }

    const root = nodeOps.createElement('div')
    render(h(ProviderOne), root)
    expect(serialize(root)).toBe(`<div>fooOverride,bar,baz</div>`)
  })

  it('reactivity with refs', async () => {
    const count = ref(1)

    const Provider = {
      setup() {
        provide('count', count)
        return () => h(Middle)
      }
    }

    const Middle = {
      render: () => h(Consumer)
    }

    const Consumer = {
      setup() {
        const count = inject('count') as Ref<number>
        return () => count.value
      }
    }

    const root = nodeOps.createElement('div')
    render(h(Provider), root)
    expect(serialize(root)).toBe(`<div>1</div>`)

    count.value++
    await nextTick()
    expect(serialize(root)).toBe(`<div>2</div>`)
  })

  it('reactivity with readonly refs', async () => {
    const count = ref(1)

    const Provider = {
      setup() {
        provide('count', readonly(count))
        return () => h(Middle)
      }
    }

    const Middle = {
      render: () => h(Consumer)
    }

    const Consumer = {
      setup() {
        const count = inject('count') as Ref<number>
        // should not work
        count.value++
        return () => count.value
      }
    }

    const root = nodeOps.createElement('div')
    render(h(Provider), root)
    expect(serialize(root)).toBe(`<div>1</div>`)

    expect(
      `Set operation on key "value" failed: target is readonly`
    ).toHaveBeenWarned()

    // source mutation should still work
    count.value++
    await nextTick()
    expect(serialize(root)).toBe(`<div>2</div>`)
  })

  it('reactivity with objects', async () => {
    const rootState = reactive({ count: 1 })

    const Provider = {
      setup() {
        provide('state', rootState)
        return () => h(Middle)
      }
    }

    const Middle = {
      render: () => h(Consumer)
    }

    const Consumer = {
      setup() {
        const state = inject('state') as typeof rootState
        return () => state.count
      }
    }

    const root = nodeOps.createElement('div')
    render(h(Provider), root)
    expect(serialize(root)).toBe(`<div>1</div>`)

    rootState.count++
    await nextTick()
    expect(serialize(root)).toBe(`<div>2</div>`)
  })

  it('reactivity with readonly objects', async () => {
    const rootState = reactive({ count: 1 })

    const Provider = {
      setup() {
        provide('state', readonly(rootState))
        return () => h(Middle)
      }
    }

    const Middle = {
      render: () => h(Consumer)
    }

    const Consumer = {
      setup() {
        const state = inject('state') as typeof rootState
        // should not work
        state.count++
        return () => state.count
      }
    }

    const root = nodeOps.createElement('div')
    render(h(Provider), root)
    expect(serialize(root)).toBe(`<div>1</div>`)

    expect(
      `Set operation on key "count" failed: target is readonly`
    ).toHaveBeenWarned()

    rootState.count++
    await nextTick()
    expect(serialize(root)).toBe(`<div>2</div>`)
  })

  it('should warn unfound', () => {
    const Provider = {
      setup() {
        return () => h(Middle)
      }
    }

    const Middle = {
      render: () => h(Consumer)
    }

    const Consumer = {
      setup() {
        const foo = inject('foo')
        expect(foo).toBeUndefined()
        return () => foo
      }
    }

    const root = nodeOps.createElement('div')
    render(h(Provider), root)
    expect(serialize(root)).toBe(`<div><!----></div>`)
    expect(`injection "foo" not found.`).toHaveBeenWarned()
  })

  it('should not warn when default value is undefined', () => {
    const Provider = {
      setup() {
        return () => h(Middle)
      }
    }

    const Middle = {
      render: () => h(Consumer)
    }

    const Consumer = {
      setup() {
        const foo = inject('foo', undefined)
        return () => foo
      }
    }

    const root = nodeOps.createElement('div')
    render(h(Provider), root)
    expect(`injection "foo" not found.`).not.toHaveBeenWarned()
  })
})
